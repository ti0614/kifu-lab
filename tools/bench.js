// usage: node tools/bench.js <wasm|native> <wasm dir or native binary> <eval dir> <threads> <movetime ms,...>
const fs = require("fs"), path = require("path"), { spawn } = require("child_process");
const [kind, target, evalDir, threads, times] = process.argv.slice(2);
const POS = {
  opening: "position startpos",
  midgame: "position startpos moves 2g2f 8c8d 2f2e 4a3b 9g9f 8d8e 6i7h 8e8f 8g8f 8b8f 5i6h 8f8d P*8g 3c3d 2e2d 2c2d 2h2d P*2c 2d2f 7a6b 3i3h",
  bench2: "position sfen l4S2l/4g1gs1/5p1p1/pr2N1pkp/4Gn3/PP3PPPP/2GPP4/1K7/L3r+s2L w BS2N5Pb 1",
  bench3: "position sfen 6n1l/2+S1k4/2lp4p/1np1B2b1/3PP4/1N1S3rP/1P2+pPP+p1/1p1G5/3KG2r1 b GSN2L4Pgs2p 1",
};
let waiter = null, last = null;
function onLine(s) {
  for (const l of s.split("\n")) {
    if (l.startsWith("info depth") && !l.includes("bound")) last = l;
    if (l.startsWith("readyok") && waiter) { const w = waiter; waiter = null; w(l); }
    if (l.startsWith("bestmove") && waiter) { const w = waiter; waiter = null; w(l); }
  }
}
const wait = () => new Promise((r) => (waiter = r));
(async () => {
  setInterval(() => {}, 1000);
  let send;
  const evalAbs = path.resolve(evalDir);
  if (kind === "wasm") {
    const Y = require(path.resolve(target, "yaneuraou.js"));
    const yo = await Y({ wasmBinary: fs.readFileSync(path.resolve(target, "yaneuraou.wasm")) });
    yo.addMessageListener(onLine);
    yo.FS.mkdir("/eval");
    for (const f of ["nn.bin", "progress.bin"]) yo.FS.writeFile(`/eval/${f}`, fs.readFileSync(path.join(evalAbs, f)));
    send = (c) => yo.ccall("usi_command", "number", ["string"], [c]);
  } else {
    const p = spawn(path.resolve(target), [], { cwd: path.dirname(path.resolve(target)) });
    let buf = "";
    p.stdout.on("data", (d) => { buf += d; const i = buf.lastIndexOf("\n"); if (i >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); } });
    send = (c) => p.stdin.write(c + "\n");
  }
  for (const c of ["usi", `setoption name EvalDir value ${kind === "wasm" ? "/eval" : evalAbs}`, "setoption name FV_SCALE value 24",
    `setoption name Threads value ${threads}`, "setoption name USI_Hash value 256", "setoption name BookFile value no_book",
    "setoption name NetworkDelay value 0", "setoption name NetworkDelay2 value 0", "setoption name MinimumThinkingTime value 1000"]) send(c);
  let w = wait(); send("isready"); await w;
  for (const t of times.split(",")) for (const [name, pos] of Object.entries(POS)) {
    last = null;
    send("usinewgame"); w = wait(); send("isready"); await w;
    send(pos); w = wait(); send(`go movetime ${t}`); const bm = await w;
    const m = last.match(/depth (\d+) seldepth (\d+).*?score (\S+ -?\d+).*?nodes (\d+) nps (\d+)/);
    console.log([kind, `T${threads}`, `${t}ms`, name, `depth=${m[1]}`, `seldepth=${m[2]}`, m[3], `nps=${m[5]}`, bm].join("\t"));
  }
  process.exit(0);
})();
