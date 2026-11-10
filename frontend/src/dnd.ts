import type { UniqueIdentifier } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { Column } from "./types";

// column id -> ordered card ids. Used for the live preview while dragging.
export type Layout = Record<number, number[]>;

export const cardKey = (id: number): string => `card-${id}`;
export const columnKey = (id: number): string => `column-${id}`;

function parseKey(prefix: "card" | "column", key: UniqueIdentifier): number | null {
  const match = new RegExp(`^${prefix}-(\\d+)$`).exec(String(key));
  return match?.[1] ? Number(match[1]) : null;
}

export const parseCardKey = (key: UniqueIdentifier): number | null => parseKey("card", key);
export const parseColumnKey = (key: UniqueIdentifier): number | null => parseKey("column", key);

export function buildLayout(columns: Column[]): Layout {
  const layout: Layout = {};
  for (const column of columns) layout[column.id] = column.cards.map((c) => c.id);
  return layout;
}

export function findColumnOf(layout: Layout, cardId: number): number | null {
  for (const [key, ids] of Object.entries(layout)) {
    if (ids.includes(cardId)) return Number(key);
  }
  return null;
}

// The column a droppable belongs to: either a card inside it, or the column itself.
export function columnOfOver(layout: Layout, overId: UniqueIdentifier): number | null {
  const cardId = parseCardKey(overId);
  if (cardId !== null) return findColumnOf(layout, cardId);
  const columnId = parseColumnKey(overId);
  return columnId !== null && layout[columnId] !== undefined ? columnId : null;
}

export function sameOrder(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

// While dragging: when the card is over a different column, return the layout with the card
// moved there. Returns null when nothing should change. `below` means the pointer is in the
// lower half of the hovered card.
export function previewLayout(
  layout: Layout,
  cardId: number,
  overId: UniqueIdentifier,
  below: boolean,
): Layout | null {
  const from = findColumnOf(layout, cardId);
  const to = columnOfOver(layout, overId);
  if (from === null || to === null || from === to) return null;

  const source = (layout[from] ?? []).filter((id) => id !== cardId);
  const target = [...(layout[to] ?? [])];
  const overCardId = parseCardKey(overId);
  let index = target.length; // over the column itself: append
  if (overCardId !== null) index = target.indexOf(overCardId) + (below ? 1 : 0);
  target.splice(index, 0, cardId);
  return { ...layout, [from]: source, [to]: target };
}

export interface MovePlan {
  columnId: number;
  ids: number[]; // the target column's final order
  beforeId: number | null; // the card that will sit directly above
  afterId: number | null; // the card that will sit directly below
}

// On drop: what to apply locally and what to send to the server. Returns null when the card
// ended up exactly where it started.
export function planMove(
  start: Layout,
  layout: Layout,
  cardId: number,
  overId: UniqueIdentifier,
): MovePlan | null {
  const columnId = findColumnOf(layout, cardId);
  if (columnId === null) return null;

  let ids = layout[columnId] ?? [];
  const overCardId = parseCardKey(overId);
  if (overCardId !== null && overCardId !== cardId && ids.includes(overCardId)) {
    ids = arrayMove(ids, ids.indexOf(cardId), ids.indexOf(overCardId));
  }

  const startColumn = findColumnOf(start, cardId);
  if (startColumn === columnId && sameOrder(start[columnId] ?? [], ids)) return null;

  const index = ids.indexOf(cardId);
  return { columnId, ids, beforeId: ids[index - 1] ?? null, afterId: ids[index + 1] ?? null };
}
export type Step = "up" | "down" | "left" | "right";

// One keyboard step for a picked-up card. Returns the new layout, or null when the card
// can't move that way. columnIds is the board's columns in left-to-right order.
export function stepLayout(
  layout: Layout,
  columnIds: number[],
  cardId: number,
  step: Step,
): Layout | null {
  const from = findColumnOf(layout, cardId);
  if (from === null) return null;
  const source = layout[from] ?? [];
  const index = source.indexOf(cardId);

  if (step === "up" || step === "down") {
    const to = step === "up" ? index - 1 : index + 1;
    if (to < 0 || to >= source.length) return null;
    return { ...layout, [from]: arrayMove(source, index, to) };
  }

  const at = columnIds.indexOf(from);
  if (at === -1) return null;
  const target = columnIds[step === "left" ? at - 1 : at + 1];
  if (target === undefined) return null;

  const targetIds = layout[target] ?? [];
  const insertAt = Math.min(index, targetIds.length); // same place in the list, or the end
  return {
    ...layout,
    [from]: source.filter((id) => id !== cardId),
    [target]: [...targetIds.slice(0, insertAt), cardId, ...targetIds.slice(insertAt)],
  };
}

// "position 2 of 3 in To do", for announcements.
export function describePlacement(layout: Layout, columns: Column[], cardId: number): string | null {
  const columnId = findColumnOf(layout, cardId);
  if (columnId === null) return null;
  const ids = layout[columnId] ?? [];
  const title = columns.find((c) => c.id === columnId)?.title ?? "this column";
  return `position ${ids.indexOf(cardId) + 1} of ${ids.length} in ${title}`;
}