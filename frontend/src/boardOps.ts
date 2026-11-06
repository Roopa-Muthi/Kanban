import type { BoardDetail, Card, ColumnRecord } from "./types";

export function addColumn(board: BoardDetail, col: ColumnRecord): BoardDetail {
  return {
    ...board,
    columns: [...board.columns, { id: col.id, title: col.title, position: col.position, cards: [] }],
  };
}

export function renameColumn(board: BoardDetail, col: ColumnRecord): BoardDetail {
  return {
    ...board,
    columns: board.columns.map((c) => (c.id === col.id ? { ...c, title: col.title } : c)),
  };
}

export function removeColumn(board: BoardDetail, columnId: number): BoardDetail {
  return { ...board, columns: board.columns.filter((c) => c.id !== columnId) };
}

// The server puts new cards at the bottom, so appending matches what a reload would show.
export function addCard(board: BoardDetail, card: Card): BoardDetail {
  return {
    ...board,
    columns: board.columns.map((c) =>
      c.id === card.column ? { ...c, cards: [...c.cards, card] } : c,
    ),
  };
}

export function replaceCard(board: BoardDetail, card: Card): BoardDetail {
  return {
    ...board,
    columns: board.columns.map((c) =>
      c.id === card.column
        ? { ...c, cards: c.cards.map((x) => (x.id === card.id ? card : x)) }
        : c,
    ),
  };
}

export function removeCard(board: BoardDetail, cardId: number): BoardDetail {
  return {
    ...board,
    columns: board.columns.map((c) => ({
      ...c,
      cards: c.cards.filter((x) => x.id !== cardId),
    })),
  };
}