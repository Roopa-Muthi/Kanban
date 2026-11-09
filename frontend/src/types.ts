export interface User {
  id: number;
  username: string;
  email: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
}

export interface RefreshResponse {
  access: string;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
}
export interface Board {
  id: number;
  name: string;
  created_at: string;
}

export interface Card {
  id: number;
  column: number;
  title: string;
  description: string;
  position: number;
  created_by: number;
  assignee: number | null;
  due_date: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Column {
  id: number;
  title: string;
  position: number;
  cards: Card[];
}

export interface BoardDetail extends Board {
  columns: Column[];
}
// What POST/PATCH /columns returns (no cards)
export interface ColumnRecord {
  id: number;
  board: number;
  title: string;
  position: number;
}
// The fields the card dialog can change; PATCH accepts any subset.
export interface CardChanges {
  title?: string;
  description?: string;
  due_date?: string | null;
  assignee?: number | null;
}