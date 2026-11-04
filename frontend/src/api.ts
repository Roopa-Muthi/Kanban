import type { LoginResponse, RefreshResponse, RegisterPayload, User } from "./types";

const BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

const ACCESS_KEY = "kanban.access";
const REFRESH_KEY = "kanban.refresh";

// localStorage is the simple choice for a portfolio project. The tradeoff is that
// any XSS can read it; httpOnly cookies are the production-grade alternative.
export const tokenStore = {
  getAccess: (): string | null => localStorage.getItem(ACCESS_KEY),
  getRefresh: (): string | null => localStorage.getItem(REFRESH_KEY),
  setTokens: (access: string, refresh: string): void => {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  setAccess: (access: string): void => localStorage.setItem(ACCESS_KEY, access),
  clear: (): void => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    super(`Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

// Turns DRF error bodies ({field: ["msg"]} or {detail: "msg"}) into readable text.
export function formatError(err: unknown): string {
  if (err instanceof ApiError) {
    const data = err.data;
    if (data && typeof data === "object") {
      const messages = Object.values(data as Record<string, unknown>).flatMap((v) =>
        Array.isArray(v) ? v.map(String) : [String(v)],
      );
      if (messages.length > 0) return messages.join(" ");
    }
    return err.message;
  }
  if (err instanceof TypeError) return "Cannot reach the server. Is the backend running?";
  return "Something went wrong.";
}

let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean; // false for login/register
}

async function refreshAccessToken(): Promise<boolean> {
  const refresh = tokenStore.getRefresh();
  if (!refresh) return false;
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as RefreshResponse;
  tokenStore.setAccess(data.access);
  return true;
}

// Shared so that several requests failing at once trigger only one refresh.
let refreshing: Promise<boolean> | null = null;

async function request<T>(path: string, options: RequestOptions = {}, canRetry = true): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const access = tokenStore.getAccess();
  if (auth && access) headers["Authorization"] = `Bearer ${access}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && auth && canRetry) {
    refreshing ??= refreshAccessToken().finally(() => {
      refreshing = null;
    });
    if (await refreshing) return request<T>(path, options, false);
    tokenStore.clear();
    onSessionExpired?.();
  }

  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export const authApi = {
  login: (username: string, password: string) =>
    request<LoginResponse>("/auth/login", { method: "POST", body: { username, password }, auth: false }),
  register: (payload: RegisterPayload) =>
    request<User>("/auth/register", { method: "POST", body: payload, auth: false }),
  me: () => request<User>("/auth/me"),
};