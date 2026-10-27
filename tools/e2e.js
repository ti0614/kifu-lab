// サイトを headless Chromium で開き、サンプル棋譜を最後まで解析できるか確かめる。
// usage: NODE_PATH=$(npm root -g) node tools/e2e.js <url> [screenshot.png]
// ヘッダーなしのサーバー（GitHub Pages と同じ条件）で試すには: (cd <親dir> && python3 -m http.server)
const { chromium } = require("playwright");

const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exit(1);
};

(async () => {
  const [url, shot] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(url);
  // coi-serviceworker による初回リロードを待つ
  await page.waitForFunction(() => self.crossOriginIsolated, null, { timeout: 30000 }).catch(() => fail("not crossOriginIsolated"));
  await page.waitForLoadState("load");

  // 不正な棋譜はエラー表示になる
  await page.fill("#kifu", "これは棋譜ではありません");
  const ng = await page.textContent("#parse-status");
  console.log("invalid input:", ng);

  await page.click("#sample");
  await page.waitForFunction(() => /手の棋譜を読み込みました/.test(document.querySelector("#parse-status").textContent));
  console.log("parse:", await page.textContent("#parse-status"), "/", await page.textContent("#estimate"));
  await page.check('input[name="movetime"][value="500"]');

  const t0 = Date.now();
  await page.click("#start");
  await page.waitForFunction(() => window.__kifuLab.game && !window.__kifuLab.running, null, { timeout: 180000 }).catch(() => fail("analysis did not finish"));
  const s = await page.evaluate(() => {
    const st = window.__kifuLab;
    const labels = st.judges.filter(Boolean).map((j) => j.label);
    return {
      moves: st.game.moves.length,
      analyzed: st.evals.filter(Boolean).length,
      blunder: labels.filter((l) => l === "blunder").length,
      dubious: labels.filter((l) => l === "dubious").length,
      best: labels.filter((l) => l === "best").length,
      depths: st.evals.map((e) => e.depth),
      firstBlunder: st.judges.findIndex((j) => j && j.label === "blunder"),
    };
  });
  console.log(`analysis: ${s.analyzed}/${s.moves + 1} positions in ${((Date.now() - t0) / 1000).toFixed(1)}s, depth ${Math.min(...s.depths)}-${Math.max(...s.depths)}`);
  console.log(`labels: blunder=${s.blunder} dubious=${s.dubious} best=${s.best}`);
  if (s.analyzed !== s.moves + 1) fail("not all positions analyzed");
  console.log("progress:", await page.textContent("#progress-text"));
  console.log("summary:", (await page.textContent("#summary")).replace(/\s+/g, " "));

  // 最初の悪手をクリックして詳細を見る
  if (s.firstBlunder > 0) {
    await page.click(`#moves .mv[data-ply="${s.firstBlunder}"]`);
    console.log("ply:", await page.textContent("#ply-label"), "eval:", await page.textContent("#eval-value"), await page.textContent("#eval-judge"));
    console.log("detail:", (await page.textContent("#detail")).replace(/\s+/g, " "));
  }
  // キーボードとグラフのクリック
  await page.keyboard.press("ArrowRight");
  console.log("after ArrowRight:", await page.textContent("#ply-label"));
  const g = await page.locator("#graph").boundingBox();
  await page.mouse.click(g.x + g.width / 2, g.y + g.height / 2);
  console.log("after graph click:", await page.textContent("#ply-label"));

  if (shot) {
    await page.click(`#moves .mv[data-ply="${s.firstBlunder > 0 ? s.firstBlunder : 1}"]`);
    await page.screenshot({ path: shot, fullPage: true });
    console.log("screenshot:", shot);
  }
  if (errors.length) fail("page errors: " + errors.join(" | "));
  console.log("OK");
  await browser.close();
})();
