import { Link, useParams } from "react-router-dom";
import { BoardColumn } from "../components/BoardColumn";
import { useBoard } from "../hooks/useBoard";
import "../board.css";

export function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const { state, retry } = useBoard(boardId);

  return (
    <main className="board-page">
      <p>
        <Link to="/">← All boards</Link>
      </p>

      {state.kind === "loading" && <p>Loading board…</p>}

      {state.kind === "notfound" && <p>Board not found.</p>}

      {state.kind === "error" && (
        <div role="alert">
          <p className="error">{state.message}</p>
          <button onClick={retry}>Try again</button>
        </div>
      )}

      {state.kind === "ready" && (
        <>
          <h1>{state.board.name}</h1>
          {state.board.columns.length === 0 ? (
            <p className="empty">This board has no columns yet. Adding columns comes on Day 10.</p>
          ) : (
            <div className="board-columns">
              {state.board.columns.map((column) => (
                <BoardColumn key={column.id} column={column} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}