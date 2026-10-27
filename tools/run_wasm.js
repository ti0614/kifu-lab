// usage: node tools/run_wasm.js <wasm dir> <eval dir> "<cmd>;<cmd>;..." [bestmove count]
const fs = require("fs"), path = require("path");
const [dir, evalDir, cmds, nBest = "1"] = process.argv.slice(2);
setInterval(() => {}, 1000);
let left = +nBest;
const onLine = (line) => {
  line = line.split("\n").filter((l) => l && !l.startsWith("option")).join("\n"); if (!line) return;
  process.stdout.write(line + "\n");
  if (/^bestmove/m.test(line) && --left === 0) setTimeout(() => process.exit(0), 100);
};
(async () => {
  const YaneuraOu = require(path.resolve(dir, "yaneuraou.js"));
  const t0 = Date.now();
  const yo = await YaneuraOu({ wasmBinary: fs.readFileSync(path.resolve(dir, "yaneuraou.wasm")), print: onLine, printErr: onLine });
  onLine(`# init ${Date.now() - t0}ms`);
  yo.FS.mkdir("/eval");
  for (const f of ["nn.bin", "progress.bin"]) yo.FS.writeFile(`/eval/${f}`, fs.readFileSync(path.join(evalDir, f)));
  for (const c of cmds.split(";")) {
    const t = Date.now();
    yo.ccall("usi_command", "number", ["string"], [c.trim()]);
    onLine(`# ${c.trim()} returned in ${Date.now() - t}ms`);
  }
})();
