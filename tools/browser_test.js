// usage: NODE_PATH=$(npm root -g) node tools/browser_test.js <url> [timeout ms]
// coi-serviceworker による初回リロードを待ってから、bestmove が出るまで待つ。
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on("pageerror", (e) => console.log("[pageerror]", e.message));
  let navs = 0; p.on("framenavigated", (f) => { if (f === p.mainFrame()) navs++; });
  await p.goto(process.argv[2]);
  const t0 = Date.now();
  let r;
  for (;;) {
    try {
      r = await p.evaluate(() => ({ coi: self.crossOriginIsolated, best: (window.lines || []).filter((l) => /^(bestmove|readyok|info depth)/.test(l)).slice(-2), err: document.getElementById("log").textContent.match(/ERROR.*/)?.[0] }));
      if (r.err || r.best.some((l) => l.startsWith("bestmove")) || Date.now() - t0 > +(process.argv[3] || 30000)) break;
    } catch (e) { /* reload in progress */ }
    await new Promise((s) => setTimeout(s, 500));
  }
  console.log("navigations:", navs, JSON.stringify(r, null, 1));
  process.exit(0);
})();
