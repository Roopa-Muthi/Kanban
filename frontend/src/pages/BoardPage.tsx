import { Link, useParams } from "react-router-dom";
import { BoardView } from "../components/BoardView";
import { useBoard } from "../hooks/useBoard";
import "../board.css";

export function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const { state, retry, updateBoard, refresh } = useBoard(boardId);

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
            <BoardView board={state.board} updateBoard={updateBoard} onResync={refresh} />
        </>
      )}
    </main>
  );
}