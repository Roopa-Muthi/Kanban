import type { UniqueIdentifier } from "@dnd-kit/core";
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
  return cardId !== null ? findColumnOf(layout, cardId) : parseColumnKey(overId);
}

export function sameOrder(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}