// やねうら王（WASM）の薄いラッパー。USIコマンドを送り、go の結果を Promise で返す。
// エンジン本体は pthread の Worker で探索するので、メインスレッドから呼んでも画面は固まらない。

const ENGINE_DIR = "build/wasm-mini/";
const EVAL_DIR = "eval/mini/";
// 評価関数を差し替えたらキャッシュ名を変える。
const EVAL_CACHE = "kifu-lab-eval-mini-v1";

export class UnsupportedBrowserError extends Error {}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`読み込みに失敗しました: ${src}`));
    document.head.appendChild(s);
  });
}

// 評価関数は約8.7MBあるので、Cache API に保存して2回目からはダウンロードしない。
async function fetchCached(url) {
  const cache = "caches" in self ? await caches.open(EVAL_CACHE).catch(() => null) : null;
  let res = cache ? await cache.match(url) : undefined;
  if (!res) {
    res = await fetch(url);
    if (!res.ok) throw new Error(`ダウンロードに失敗しました: ${url} (${res.status})`);
    if (cache) await cache.put(url, res.clone()).catch(() => {});
  }
  return new Uint8Array(await res.arrayBuffer());
}

// info 行から、最後の exact な評価（無ければ最後の bound）を取り出す。
function parseResult(infos, bestLine) {
  let chosen = null;
  let chosenExact = false;
  for (const l of infos) {
    const mpv = l.match(/ multipv (\d+)/);
    if (mpv && mpv[1] !== "1") continue;
    const exact = !/ (upper|lower)bound /.test(l);
    if (exact || !chosenExact) {
      chosen = l;
      chosenExact = exact;
    }
  }
  const best = bestLine.split(/\s+/)[1];
  if (!chosen) return { best, depth: 0, cp: null, mate: null, pv: [] };
  const depth = +(chosen.match(/ depth (\d+)/) || [0, 0])[1];
  const sc = chosen.match(/ score (cp|mate) ([-+]?\d+)/);
  const pv = (chosen.match(/ pv (.*)$/) || [0, ""])[1].trim().split(/\s+/).filter(Boolean);
  return {
    best,
    depth,
    cp: sc && sc[1] === "cp" ? +sc[2] : null,
    mate: sc && sc[1] === "mate" ? +sc[2] : null,
    pv,
  };
}

export class Engine {
  static async create({ threads, hashMb, onStatus = () => {} }) {
    if (typeof SharedArrayBuffer === "undefined" || !self.crossOriginIsolated) {
      throw new UnsupportedBrowserError();
    }
    onStatus("エンジンを読み込み中…");
    await loadScript(ENGINE_DIR + "yaneuraou.js");
    const mod = await self.YaneuraOu({ locateFile: (f) => ENGINE_DIR + f });
    onStatus("評価関数を読み込み中…（初回のみ約8.7MB）");
    const [nn, progress] = await Promise.all([fetchCached(EVAL_DIR + "nn.bin"), fetchCached(EVAL_DIR + "progress.bin")]);
    mod.FS.mkdir("/eval");
    mod.FS.writeFile("/eval/nn.bin", nn);
    mod.FS.writeFile("/eval/progress.bin", progress);

    const engine = new Engine(mod);
    for (const c of [
      "usi",
      "setoption name EvalDir value /eval",
      "setoption name FV_SCALE value 24",
      `setoption name Threads value ${threads}`,
      `setoption name USI_Hash value ${hashMb}`,
      "setoption name BookFile value no_book",
      "setoption name NetworkDelay value 0",
      "setoption name NetworkDelay2 value 0",
      "setoption name MinimumThinkingTime value 100",
      "setoption name MultiPV value 1",
    ]) engine.send(c);
    onStatus("評価関数を展開中…");
    await engine.isReady();
    return engine;
  }

  constructor(mod) {
    this.mod = mod;
    this.onLine = null;
    // wasm_pre.js が print を差し替えるので、出力は addMessageListener で受け取る。
    mod.addMessageListener((s) => {
      for (const l of String(s).split("\n")) if (l && this.onLine) this.onLine(l);
    });
  }

  // wasm_pre.js のコマンドキューは使わず、usi_command を直接呼ぶ。
  send(cmd) {
    this.mod.ccall("usi_command", "number", ["string"], [cmd]);
  }

  isReady() {
    return new Promise((resolve) => {
      this.onLine = (l) => {
        if (l.startsWith("readyok")) {
          this.onLine = null;
          resolve();
        }
      };
      this.send("isready");
    });
  }

  newGame() {
    this.send("usinewgame");
  }

  // positionCmd: "position ..." を1局面ぶん解析する。
  analyze(positionCmd, movetimeMs) {
    return new Promise((resolve) => {
      const infos = [];
      this.onLine = (l) => {
        if (l.startsWith("info ") && l.includes(" score ")) infos.push(l);
        else if (l.startsWith("bestmove")) {
          this.onLine = null;
          resolve(parseResult(infos, l));
        }
      };
      this.send(positionCmd);
      this.send(`go movetime ${movetimeMs}`);
    });
  }

  stop() {
    this.send("stop");
  }
}
