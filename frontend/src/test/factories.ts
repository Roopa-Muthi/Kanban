import type { BoardDetail, Card, Column } from "../types";

export function makeCard(id: number, column: number, overrides: Partial<Card> = {}): Card {
  return {
    id,
    column,
    title: `Card ${id}`,
    description: "",
    position: id * 1000,
    created_by: 1,
    assignee: null,
    due_date: null,
    version: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

export function makeColumn(id: number, cards: Card[] = [], title = `Column ${id}`): Column {
  return { id, title, position: id * 1000, cards };
}

export function makeBoard(columns: Column[]): BoardDetail {
  return { id: 1, name: "Test board", created_at: "2026-01-01T00:00:00Z", columns };
}