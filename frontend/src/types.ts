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