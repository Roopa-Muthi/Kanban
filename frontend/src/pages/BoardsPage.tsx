import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, formatError } from "../api";
import { useAuth } from "../auth/useAuth";
import type { Board } from "../types";

type Status = "loading" | "error" | "ready";

export function BoardsPage() {
  const { user, logout } = useAuth();
  const [boards, setBoards] = useState<Board[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBoards(await api.get<Board[]>("/boards"));
      setLoadError(null);
      setStatus("ready");
    } catch (err) {
      setLoadError(formatError(err));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    setActionError(null);
    try {
      const board = await api.post<Board>("/boards", { name: trimmed });
      setBoards((prev) => [board, ...prev]); // the API lists newest first
      setName("");
    } catch (err) {
      setActionError(formatError(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(board: Board) {
    if (!window.confirm(`Delete "${board.name}" and everything in it?`)) return;
    setActionError(null);
    try {
      await api.delete<void>(`/boards/${board.id}`);
      setBoards((prev) => prev.filter((b) => b.id !== board.id));
    } catch (err) {
      setActionError(formatError(err));
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Your boards</h1>
        <button onClick={logout}>Log out ({user?.username})</button>
      </header>

      <form onSubmit={handleCreate} style={{ display: "flex", gap: 8, margin: "1rem 0" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New board name"
          maxLength={200}
          aria-label="New board name"
          style={{ flex: 1 }}
        />
        <button type="submit" disabled={creating || name.trim() === ""}>
          {creating ? "Creating…" : "Create board"}
        </button>
      </form>

      {actionError && (
        <p role="alert" style={{ color: "crimson" }}>
          {actionError}
        </p>
      )}

      {status === "loading" && <p>Loading boards…</p>}

      {status === "error" && (
        <div role="alert">
          <p style={{ color: "crimson" }}>{loadError}</p>
          <button
            onClick={() => {
              setStatus("loading");
              void load();
            }}
          >
            Try again
          </button>
        </div>
      )}

      {status === "ready" && boards.length === 0 && (
        <p>You don't have any boards yet. Create your first one above.</p>
      )}

      {status === "ready" && boards.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {boards.map((board) => (
            <li
              key={board.id}
              style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0" }}
            >
              <Link to={`/boards/${board.id}`}>{board.name}</Link>
              <button onClick={() => void handleDelete(board)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}