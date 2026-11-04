import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, formatError } from "../api";
import type { BoardDetail } from "../types";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "notfound" }
  | { kind: "ready"; board: BoardDetail };

export function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!boardId) return;
    let cancelled = false;
    api
      .get<BoardDetail>(`/boards/${boardId}`)
      .then((board) => {
        if (!cancelled) setState({ kind: "ready", board });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setState({ kind: "notfound" });
        else setState({ kind: "error", message: formatError(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  return (
    <main style={{ maxWidth: 960, margin: "2rem auto", padding: "0 1rem" }}>
      <p>
        <Link to="/">← All boards</Link>
      </p>

      {state.kind === "loading" && <p>Loading board…</p>}

      {state.kind === "notfound" && <p>Board not found.</p>}

      {state.kind === "error" && (
        <p role="alert" style={{ color: "crimson" }}>
          {state.message}
        </p>
      )}

      {state.kind === "ready" && (
        <>
          <h1>{state.board.name}</h1>
          {state.board.columns.length === 0 ? (
            <p>This board has no columns yet. Adding them comes in Week 2.</p>
          ) : (
            <ul>
              {state.board.columns.map((col) => (
                <li key={col.id}>
                  {col.title} ({col.cards.length} cards)
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}