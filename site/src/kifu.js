// 棋譜の読み込みと、解析結果から悪手などを判定する処理（DOMに依存しない）。
import {
  Color,
  InitialPositionSFEN,
  Move,
  Position,
  Record,
  RecordFormatType,
  Square,
  detectRecordFormat,
  formatMove,
  formatPV,
  getBlackPlayerName,
  getWhitePlayerName,
  importCSA,
  importJKFString,
  importKI2,
  importKIF,
} from "tsshogi";

// 判定のしきい値（指した側から見た評価値の損失）
export const BLUNDER_LOSS = 300;
export const DUBIOUS_LOSS = 150;
// 詰みの評価値。損失の計算ではこれを MATE_CLAMP で頭打ちにする。
export const MATE_VALUE = 30000;
const MATE_CLAMP = 3000;

// 表記をそろえる：☗☖ → ▲△、「同　銀」→「同銀」
const tidy = (s) => s.replace(/☗/g, "▲").replace(/☖/g, "△").replace(/　/g, "");

function importRecord(text) {
  switch (detectRecordFormat(text)) {
    case RecordFormatType.KIF:
      return importKIF(text);
    case RecordFormatType.KI2:
      return importKI2(text);
    case RecordFormatType.CSA:
      return importCSA(text);
    case RecordFormatType.JKF:
      return importJKFString(text);
    case RecordFormatType.USI:
    case RecordFormatType.SFEN:
      return Record.newByUSI(text);
    default:
      return new Error("棋譜の形式を判定できませんでした");
  }
}

// 棋譜テキストを読み込み、本譜の局面と指し手の一覧を返す。
export function parseGame(text) {
  const record = importRecord(text.trim());
  if (record instanceof Error) throw new Error(`棋譜を読み込めませんでした（${record.message}）`);

  const nodes = record.moves.filter((n) => n.move instanceof Move);
  if (nodes.length === 0) throw new Error("棋譜を読み取れませんでした（指し手が見つかりません）");
  const last = record.moves[record.moves.length - 1];
  const endName = last.move instanceof Move || last.move.type === "start" ? "" : specialName(last.move.type);

  const initialSfen = record.initialPosition.sfen;
  const pos = Position.newBySFEN(initialSfen);
  const positions = [{ sfen: pos.sfen, lastTo: -1, color: pos.color }];
  const moves = [];
  let lastMove;
  for (const n of nodes) {
    const m = n.move;
    moves.push({ usi: m.usi, text: tidy(formatMove(pos, m, { lastMove })), color: pos.color });
    if (!pos.doMove(m)) throw new Error(`${moves.length}手目の指し手が不正です`);
    lastMove = m;
    positions.push({ sfen: pos.sfen, lastTo: m.to instanceof Square ? m.to.index : -1, color: pos.color });
  }
  return {
    initialSfen,
    positions,
    moves,
    endName,
    black: getBlackPlayerName(record.metadata) || "先手",
    white: getWhitePlayerName(record.metadata) || "後手",
  };
}

function specialName(type) {
  const names = {
    resign: "投了",
    interrupt: "中断",
    impass: "持将棋",
    draw: "引き分け",
    repetitionDraw: "千日手",
    mate: "詰み",
    noMate: "不詰",
    timeout: "切れ負け",
    foulWin: "反則勝ち",
    foulLose: "反則負け",
    enteringOfKing: "入玉勝ち",
    winByDefault: "不戦勝",
    loseByDefault: "不戦敗",
    tryRule: "トライ",
  };
  return names[type] || "";
}

// i 手目までを指した局面を表す USI の position コマンド
export function positionCommand(game, i) {
  const moves = game.moves.slice(0, i).map((m) => m.usi);
  const base = game.initialSfen === InitialPositionSFEN.STANDARD ? "position startpos" : `position sfen ${game.initialSfen}`;
  return moves.length ? `${base} moves ${moves.join(" ")}` : base;
}

// エンジンの結果（手番側から見た値）を先手から見た値に直す。
export function toBlackView(result, color) {
  const sign = color === Color.BLACK ? 1 : -1;
  if (result.mate !== null) {
    // "mate -0" は既に詰んでいる（手番側の負け）。
    const winning = result.mate > 0 || Object.is(result.mate, 0);
    const v = winning ? MATE_VALUE - result.mate : -MATE_VALUE - result.mate;
    return { value: sign * v, mate: sign * result.mate };
  }
  if (result.cp !== null) return { value: sign * result.cp, mate: null };
  // 指し手が無い（詰んでいる）局面では bestmove resign だけが返る。
  if (result.best === "resign") return { value: -sign * MATE_VALUE, mate: -sign * 0 };
  if (result.best === "win") return { value: sign * MATE_VALUE, mate: null };
  return { value: 0, mate: null };
}

const clamp = (v) => Math.max(-MATE_CLAMP, Math.min(MATE_CLAMP, v));

// n 手目（1始まり）の判定。before/after は先手から見た評価。
export function judgeMove(game, evals, n) {
  const before = evals[n - 1];
  const after = evals[n];
  if (!before || !after) return null;
  const black = game.moves[n - 1].color === Color.BLACK;
  const loss = black ? clamp(before.value) - clamp(after.value) : clamp(after.value) - clamp(before.value);
  const played = game.moves[n - 1].usi;
  const label = played === before.best ? "best" : loss >= BLUNDER_LOSS ? "blunder" : loss >= DUBIOUS_LOSS ? "dubious" : "";
  return { loss, label };
}

// i 手目の局面での読み筋（日本語）
export function formatBestLine(game, i, pv, maxMoves = 8) {
  const pos = Position.newBySFEN(game.positions[i].sfen);
  const start = Position.newBySFEN(game.positions[i].sfen);
  const moves = [];
  for (const usi of pv.slice(0, maxMoves)) {
    const m = pos.createMoveByUSI(usi);
    if (!m || !pos.doMove(m)) break;
    moves.push(m);
  }
  const lastMove = i > 0 ? Position.newBySFEN(game.positions[i - 1].sfen).createMoveByUSI(game.moves[i - 1].usi) : undefined;
  return {
    best: moves.length ? tidy(formatMove(start, moves[0], { lastMove: lastMove || undefined })) : "",
    pv: tidy(formatPV(start, moves)),
  };
}
