import { Engine, UnsupportedBrowserError } from "./engine.js";
import { parseGame, positionCommand, toBlackView, judgeMove, formatBestLine, MATE_VALUE } from "./kifu.js";
import { setupBoard, renderBoard } from "./board.js";
import { renderGraph, plyAt } from "./graph.js";

const $ = (id) => document.getElementById(id);
const UNSUPPORTED =
  "このブラウザでは解析できません（SharedArrayBuffer が使えません）。" +
  "プライベートウィンドウやアプリ内ブラウザの場合は、通常の Chrome / Edge / Firefox / Safari で開いてください。";

const state = {
  game: null,
  evals: [], // i 手目の局面の評価（先手から見た値）: { value, mate, depth, best, pv }
  judges: [], // n 手目の判定: { loss, label }
  ply: 0,
  running: false,
  cancel: false,
};
let engine = null;
let enginePromise = null;
// 実行中の解析ループ。次の解析はこれが終わってから始める（エンジンは1つの go しか扱えない）。
let loopDone = Promise.resolve();
// e2e テスト用
window.__kifuLab = state;

// ---------- 表示用の整形 ----------

function fmtEval(e) {
  if (!e) return "…";
  if (e.mate !== null) {
    const who = e.value > 0 ? "先手" : "後手";
    return Math.abs(e.mate) === 0 ? `${who}勝ち` : `${who}詰み${Math.abs(e.mate)}手`;
  }
  const s = Math.abs(e.value).toLocaleString("ja-JP");
  return e.value > 0 ? `+${s}` : e.value < 0 ? `−${s}` : "0";
}

function judgeText(e) {
  if (!e) return "";
  const v = e.value;
  const a = Math.abs(v);
  const side = v >= 0 ? "先手" : "後手";
  if (e.mate !== null || a >= MATE_VALUE - 1000) return `${side}勝ち筋`;
  if (a < 200) return "互角";
  if (a < 500) return `${side}やや有利`;
  if (a < 1000) return `${side}有利`;
  if (a < 2000) return `${side}優勢`;
  return `${side}勝勢`;
}

const TAGS = {
  blunder: '<span class="tag tag-blunder">?? 悪手</span>',
  dubious: '<span class="tag tag-dubious">?! 疑問手</span>',
  best: '<span class="tag tag-best">最善手</span>',
};
const ROW_TAGS = {
  blunder: '<span class="tag tag-blunder">?? 悪手</span>',
  dubious: '<span class="tag tag-dubious">?! 疑問</span>',
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------- 入力画面 ----------

function selectedMovetime() {
  return +document.querySelector('input[name="movetime"]:checked').value;
}

function updateParseStatus() {
  const text = $("kifu").value.trim();
  const status = $("parse-status");
  if (!text) {
    status.textContent = "";
    status.className = "";
    $("estimate").textContent = "";
    return null;
  }
  try {
    const game = parseGame(text);
    status.textContent = `${game.moves.length}手の棋譜を読み込みました`;
    status.className = "parse-ok";
    const sec = Math.ceil(((game.moves.length + 1) * selectedMovetime()) / 1000);
    $("estimate").textContent = `この棋譜で 約${sec < 90 ? sec + "秒" : Math.round(sec / 60) + "分"}かかります`;
    return game;
  } catch (e) {
    status.textContent = e.message;
    status.className = "parse-ng";
    $("estimate").textContent = "";
    return null;
  }
}

async function readFile(file) {
  const buf = await file.arrayBuffer();
  // KIF は Shift_JIS のことが多い。UTF-8 として不正なら Shift_JIS で読み直す。
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("shift_jis").decode(buf);
  }
}

// ---------- 解析画面 ----------

function buildMoveList() {
  const list = $("moves");
  list.innerHTML = "";
  state.game.moves.forEach((m, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mv";
    b.dataset.ply = String(i + 1);
    b.innerHTML = `<span class="n">${i + 1}</span><span class="t">${esc(m.text)}</span><span class="e pending">…</span><span class="j"></span>`;
    b.addEventListener("click", () => show(i + 1));
    list.appendChild(b);
  });
}

function updateMoveRow(n) {
  const row = $("moves").children[n - 1];
  if (!row) return;
  const e = state.evals[n];
  const j = state.judges[n];
  const ev = row.querySelector(".e");
  ev.textContent = fmtEval(e);
  ev.classList.toggle("pending", !e);
  row.querySelector(".j").innerHTML = j && ROW_TAGS[j.label] ? ROW_TAGS[j.label] : "";
  row.setAttribute("aria-label", `${n}手目 ${state.game.moves[n - 1].text} 評価値 ${fmtEval(e)}${j && j.label === "blunder" ? " 悪手" : j && j.label === "dubious" ? " 疑問手" : ""}`);
}

function renderDetail() {
  const { game, ply } = state;
  const el = $("detail");
  const pos = state.evals[ply];
  const parts = [];
  if (ply > 0) {
    const m = game.moves[ply - 1];
    const before = state.evals[ply - 1];
    const j = state.judges[ply];
    let change = "";
    if (before && pos && before.mate === null && pos.mate === null) {
      change = `${fmtEval(before)} → ${fmtEval(pos)}`;
      if (j && j.loss > 0) change += `（${m.color === "black" ? "先手" : "後手"}が${j.loss}損）`;
    }
    parts.push(`<dt>指した手</dt><dd><span class="played">${esc(m.text)}</span>${j && TAGS[j.label] ? TAGS[j.label] : ""}<span class="small muted">${esc(change)}</span></dd>`);
    if (before && before.pv.length && (!j || j.label !== "best")) {
      const line = formatBestLine(game, ply - 1, before.pv);
      parts.push(`<dt>最善手</dt><dd><span class="best">${esc(line.best)}</span></dd>`);
      parts.push(`<dt>読み筋</dt><dd><span class="pv">${esc(line.pv)}</span><span class="small muted">深さ ${before.depth}</span></dd>`);
    }
  }
  if (pos && pos.pv.length) {
    const line = formatBestLine(game, ply, pos.pv);
    parts.push(`<dt>次の最善手</dt><dd><span class="best">${esc(line.best)}</span></dd>`);
    parts.push(`<dt>読み筋</dt><dd><span class="pv">${esc(line.pv)}</span><span class="small muted">深さ ${pos.depth}</span></dd>`);
  } else if (!pos) {
    parts.push(`<p>この局面はまだ解析中です。</p>`);
  } else if (ply === game.moves.length && game.endName) {
    parts.push(`<p>まで${game.moves.length}手で${esc(game.endName)}。</p>`);
  }
  el.innerHTML = parts.join("");
}

function renderSummary() {
  const rows = [
    { name: "☗ 先手", color: "black" },
    { name: "☖ 後手", color: "white" },
  ].map(({ name, color }) => {
    let blunders = 0, dubious = 0, best = 0, total = 0;
    state.game.moves.forEach((m, i) => {
      const j = state.judges[i + 1];
      if (m.color !== color || !j) return;
      total++;
      if (j.label === "blunder") blunders++;
      if (j.label === "dubious") dubious++;
      if (j.label === "best") best++;
    });
    const rate = total ? `${Math.round((best / total) * 100)}%` : "—";
    return `<tr><th scope="row">${name}</th><td>${blunders}</td><td>${dubious}</td><td>${rate}</td></tr>`;
  });
  $("summary").innerHTML = rows.join("");
}

function renderGraphNow() {
  const n = state.game.moves.length;
  const values = [];
  const labels = [];
  for (let i = 0; i <= n; i++) {
    values.push(state.evals[i] ? state.evals[i].value : null);
    labels.push(state.judges[i] ? state.judges[i].label : "");
  }
  renderGraph($("graph"), { values, labels, current: state.ply });
}

function show(ply) {
  const { game } = state;
  if (!game) return;
  state.ply = Math.max(0, Math.min(game.moves.length, ply));
  const p = game.positions[state.ply];
  renderBoard(document.querySelector(".board-card"), p.sfen, p.lastTo);
  $("ply-label").textContent = state.ply === 0 ? "開始局面" : `${state.ply}手目 / ${game.moves.length}`;
  const e = state.evals[state.ply];
  $("eval-value").textContent = fmtEval(e);
  $("eval-judge").textContent = judgeText(e);
  renderDetail();
  for (const row of $("moves").children) {
    const on = +row.dataset.ply === state.ply;
    row.setAttribute("aria-current", on ? "true" : "false");
    if (on) row.scrollIntoView({ block: "nearest" });
  }
  renderGraphNow();
}

function setProgress(done, total, finished) {
  $("progress").max = total;
  $("progress").value = done;
  const chip = $("progress-text");
  chip.classList.toggle("done", finished && done === total);
  chip.textContent = finished ? (done === total ? "解析完了" : `中止（${done}/${total}局面）`) : `解析中 ${done}/${total}`;
  $("progress").hidden = finished;
  $("cancel").hidden = finished;
}

// ---------- エンジンと解析ループ ----------

function getEngine(onStatus) {
  if (!enginePromise) {
    const threads = Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1));
    const hashMb = navigator.deviceMemory && navigator.deviceMemory <= 4 ? 64 : 256;
    enginePromise = Engine.create({ threads, hashMb, onStatus }).then((e) => (engine = e));
    enginePromise.catch(() => (enginePromise = null));
  }
  return enginePromise;
}

async function start() {
  if (state.running) return;
  $("warn").hidden = true;
  const game = updateParseStatus();
  if (!game) {
    $("kifu").focus();
    return;
  }
  const movetime = selectedMovetime();
  const startBtn = $("start");
  startBtn.disabled = true;
  try {
    await getEngine((s) => ($("parse-status").textContent = s));
  } catch (e) {
    startBtn.disabled = false;
    $("warn").textContent = e instanceof UnsupportedBrowserError ? UNSUPPORTED : `エンジンを起動できませんでした：${e.message}`;
    $("warn").hidden = false;
    updateParseStatus();
    return;
  }
  startBtn.disabled = false;
  updateParseStatus();

  await loopDone;
  Object.assign(state, { game, evals: [], judges: [], ply: 0, running: true, cancel: false });
  $("input-view").hidden = true;
  $("analysis-view").hidden = false;
  $("to-input").hidden = false;
  $("players").textContent = `☗ ${game.black} 対 ☖ ${game.white}`;
  $("black-name").textContent = game.black;
  $("white-name").textContent = game.white;
  $("move-count").textContent = `${game.moves.length}手${game.endName ? "（" + game.endName + "）" : ""} · 1手${movetime / 1000}秒`;
  buildMoveList();
  renderSummary();
  show(0);
  window.scrollTo(0, 0);

  loopDone = runAnalysis(game, movetime);
  await loopDone;
}

async function runAnalysis(game, movetime) {
  const total = game.moves.length + 1;
  setProgress(0, total, false);
  engine.newGame();
  for (let i = 0; i < total; i++) {
    if (state.cancel) break;
    const result = await engine.analyze(positionCommand(game, i), movetime);
    if (state.game !== game) return; // 入力画面に戻った
    state.evals[i] = { ...toBlackView(result, game.positions[i].color), depth: result.depth, best: result.best, pv: result.pv };
    if (i > 0) {
      state.judges[i] = judgeMove(game, state.evals, i);
      updateMoveRow(i);
    }
    setProgress(i + 1, total, false);
    renderSummary();
    if (state.ply === i || state.ply === i + 1) show(state.ply);
    else renderGraphNow();
  }
  state.running = false;
  setProgress(state.evals.filter(Boolean).length, total, true);
}

function backToInput() {
  if (state.running) {
    state.cancel = true;
    engine.stop();
  }
  state.game = null;
  state.running = false;
  $("analysis-view").hidden = true;
  $("input-view").hidden = false;
  $("to-input").hidden = true;
  updateParseStatus();
}

// ---------- イベント ----------

function init() {
  if (!self.crossOriginIsolated && !navigator.serviceWorker) {
    $("warn").textContent = UNSUPPORTED;
    $("warn").hidden = false;
  }
  setupBoard(document.querySelector(".board-card"));
  $("kifu").addEventListener("input", updateParseStatus);
  $("times").addEventListener("change", updateParseStatus);
  $("file").addEventListener("change", async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    $("kifu").value = await readFile(f);
    updateParseStatus();
  });
  $("sample").addEventListener("click", async () => {
    const res = await fetch("sample.kif");
    $("kifu").value = await res.text();
    updateParseStatus();
  });
  $("start").addEventListener("click", start);
  $("to-input").addEventListener("click", backToInput);
  $("cancel").addEventListener("click", () => {
    state.cancel = true;
    if (engine) engine.stop();
  });
  document.querySelector(".nav-row").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-nav]");
    if (!b) return;
    const n = state.game.moves.length;
    show({ first: 0, prev: state.ply - 1, next: state.ply + 1, last: n }[b.dataset.nav]);
  });
  $("graph").addEventListener("click", (ev) => {
    const r = ev.currentTarget.getBoundingClientRect();
    show(plyAt((ev.clientX - r.left) / r.width, state.game.moves.length));
  });
  document.addEventListener("keydown", (ev) => {
    if (!state.game || $("analysis-view").hidden) return;
    if (ev.target.closest("input, textarea, select")) return;
    if (ev.key === "ArrowLeft") show(state.ply - 1);
    else if (ev.key === "ArrowRight") show(state.ply + 1);
    else if (ev.key === "Home") show(0);
    else if (ev.key === "End") show(state.game.moves.length);
    else return;
    ev.preventDefault();
  });
}

init();
