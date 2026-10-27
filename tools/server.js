// COOP/COEP 付きの静的サーバー（SharedArrayBuffer を使うため cross-origin isolation が必要）
// usage: node tools/server.js [dir=_site] [port=8080]   → http://localhost:8080/
// GitHub Pages と同じくヘッダーなしで確かめたいときは python3 -m http.server を使う。
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, "../_site"));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".wasm": "application/wasm" };
http.createServer((req, res) => {
  let p = path.join(ROOT, path.normalize(decodeURIComponent(req.url.split("?")[0])));
  if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (p.endsWith(path.sep)) p = path.join(p, "index.html");
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(p)] || "application/octet-stream",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    });
    res.end(data);
  });
}).listen(+process.argv[3] || 8080);
