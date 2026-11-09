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
// Moves a card into a column and orders that column to match orderedIds.
// Works for same-column and cross-column moves.
export function placeCard(
  board: BoardDetail,
  cardId: number,
  columnId: number,
  orderedIds: number[],
): BoardDetail {
  const moving = board.columns.flatMap((c) => c.cards).find((c) => c.id === cardId);
  if (!moving) return board;
  const placed: Card = { ...moving, column: columnId };
  const rank = new Map(orderedIds.map((id, i): [number, number] => [id, i]));
  const rankOf = (id: number) => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
  return {
    ...board,
    columns: board.columns.map((c) => {
      const others = c.cards.filter((x) => x.id !== cardId);
      if (c.id !== columnId) return { ...c, cards: others };
      return { ...c, cards: [...others, placed].sort((a, b) => rankOf(a.id) - rankOf(b.id)) };
    }),
  };
}

// Copies only the server-owned fields from a move response. It deliberately leaves the
// card's column and order alone, because a later queued move may already have changed them.
export function syncCard(board: BoardDetail, server: Card): BoardDetail {
  return {
    ...board,
    columns: board.columns.map((c) => ({
      ...c,
      cards: c.cards.map((x) =>
        x.id === server.id
          ? { ...x, position: server.position, version: server.version, updated_at: server.updated_at }
          : x,
      ),
    })),
  };
}
// Copies the content fields a PATCH can change, plus the server-owned version and timestamp.
// Unlike replaceCard it leaves column and position alone, so an edit that finishes while a
// move is still saving can't pull the card back to its old place.
export function mergeCardFields(board: BoardDetail, server: Card): BoardDetail {
  return {
    ...board,
    columns: board.columns.map((c) => ({
      ...c,
      cards: c.cards.map((x) =>
        x.id === server.id
          ? {
              ...x,
              title: server.title,
              description: server.description,
              due_date: server.due_date,
              assignee: server.assignee,
              version: server.version,
              updated_at: server.updated_at,
            }
          : x,
      ),
    })),
  };
}