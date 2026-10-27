// 盤面の描画（9x9のマスと持ち駒）
import { Color, Position, Square, handPieceTypes, pieceTypeToStringForBoard, pieceTypeToStringForMove } from "tsshogi";

const FILES = ["９", "８", "７", "６", "５", "４", "３", "２", "１"];
const RANKS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

export function setupBoard(root) {
  root.querySelector(".files").innerHTML = FILES.map((f) => `<span>${f}</span>`).join("");
  root.querySelector(".ranks").innerHTML = RANKS.map((r) => `<span>${r}</span>`).join("");
  const grid = root.querySelector(".grid");
  grid.innerHTML = "";
  for (let i = 0; i < 81; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.appendChild(document.createElement("span"));
    grid.appendChild(cell);
  }
}

function handText(pos, color) {
  const hand = pos.hand(color);
  const parts = [];
  // 飛角金銀桂香歩の順に並べる
  for (const t of [...handPieceTypes].reverse()) {
    const n = hand.count(t);
    if (n) parts.push(pieceTypeToStringForMove(t) + (n > 1 ? n : ""));
  }
  return parts.join(" ") || "なし";
}

export function renderBoard(root, sfen, lastTo) {
  const pos = Position.newBySFEN(sfen);
  const cells = root.querySelectorAll(".grid .cell");
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const sq = Square.newByXY(x, y);
      const cell = cells[sq.index];
      const pc = pos.board.at(sq);
      const label = cell.firstChild;
      label.textContent = pc ? pieceTypeToStringForBoard(pc.type) : "";
      cell.classList.toggle("gote", !!pc && pc.color === Color.WHITE);
      cell.classList.toggle("last", sq.index === lastTo);
    }
  }
  root.querySelector(".hand-black").textContent = handText(pos, Color.BLACK);
  root.querySelector(".hand-white").textContent = handText(pos, Color.WHITE);
}
