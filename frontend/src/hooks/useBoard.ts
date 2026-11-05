import { useCallback, useEffect, useState } from "react";
import { api, ApiError, formatError } from "../api";
import type { BoardDetail } from "../types";

export type BoardState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "notfound" }
  | { kind: "ready"; board: BoardDetail };

export function useBoard(boardId: string | undefined) {
  const [state, setState] = useState<BoardState>(
    boardId ? { kind: "loading" } : { kind: "notfound" },
  );
  const [attempt, setAttempt] = useState(0);

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
  }, [boardId, attempt]);

  const retry = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((a) => a + 1);
  }, []);

  return { state, retry };
}