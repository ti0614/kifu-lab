// 評価値グラフ（SVG）。上が先手有利、±2000で頭打ち。
const W = 1000;
const H = 200;
const MID = H / 2;
const CAP = 2000;

const x = (i, n) => (n === 0 ? 0 : (i / n) * W);
const y = (v) => MID - (Math.max(-CAP, Math.min(CAP, v)) / CAP) * (MID - 12);

export function renderGraph(svg, { values, labels, current }) {
  const n = values.length - 1;
  const pts = [];
  values.forEach((v, i) => {
    if (v !== null) pts.push(`${x(i, n).toFixed(1)},${y(v).toFixed(1)}`);
  });
  const line = pts.length ? "M" + pts.join(" L") : "";
  const lastX = pts.length ? pts[pts.length - 1].split(",")[0] : 0;
  const area = pts.length ? `M0,${MID} L${pts.join(" L")} L${lastX},${MID} Z` : "";

  let blunders = "";
  let dubious = "";
  labels.forEach((label, i) => {
    const v = values[i];
    if (v === null) return;
    const cx = x(i, n);
    const cy = y(v);
    if (label === "blunder") blunders += `M${cx - 6},${cy} a6,6 0 1,0 12,0 a6,6 0 1,0 -12,0 `;
    if (label === "dubious") dubious += `M${cx - 5},${cy - 5} h10 v10 h-10 Z `;
  });
  const cur = x(current, n);

  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = `
    <defs>
      <clipPath id="g-above"><rect x="0" y="0" width="${W}" height="${MID}"/></clipPath>
      <clipPath id="g-below"><rect x="0" y="${MID}" width="${W}" height="${MID}"/></clipPath>
    </defs>
    <rect x="0" y="0" width="${W}" height="${H}" class="g-bg"/>
    <line x1="0" y1="${y(1000)}" x2="${W}" y2="${y(1000)}" class="g-grid"/>
    <line x1="0" y1="${y(-1000)}" x2="${W}" y2="${y(-1000)}" class="g-grid"/>
    <path d="${area}" class="g-above" clip-path="url(#g-above)"/>
    <path d="${area}" class="g-below" clip-path="url(#g-below)"/>
    <line x1="0" y1="${MID}" x2="${W}" y2="${MID}" class="g-zero"/>
    <path d="${line}" class="g-line"/>
    <line x1="${cur}" y1="0" x2="${cur}" y2="${H}" class="g-cursor"/>
    <path d="${blunders || "M0,0"}" class="g-blunder"/>
    <path d="${dubious || "M0,0"}" class="g-dubious"/>`;
}

// クリック位置（0〜1）から局面番号へ
export function plyAt(ratio, n) {
  return Math.max(0, Math.min(n, Math.round(ratio * n)));
}
