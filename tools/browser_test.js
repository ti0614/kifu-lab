// usage: node tools/browser_test.js <url> [timeout ms]   (playwright が必要)
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on("pageerror", (e) => console.log("[pageerror]", e.message));
  p.on("console", (m) => { if (m.type() !== "log") console.log("[" + m.type() + "]", m.text().slice(0, 300)); });
  await p.goto(process.argv[2]);
  console.log("crossOriginIsolated:", await p.evaluate(() => crossOriginIsolated));
  await p.waitForFunction(() => window.lines && lines.some((l) => l.startsWith("bestmove")), null, { timeout: +(process.argv[3] || 30000) }).catch(() => console.log("timeout"));
  console.log(await p.evaluate(() => lines.join("\n")));
  process.exit(0);
})();
