import { useState } from "react";
import { api, formatError } from "../api";
import * as ops from "../boardOps";
import type { BoardDetail, Card, Column, ColumnRecord } from "../types";
import { AddForm } from "./AddForm";
import { BoardColumn } from "./BoardColumn";

interface Props {
  board: BoardDetail;
  updateBoard: (fn: (board: BoardDetail) => BoardDetail) => void;
}

export function BoardView({ board, updateBoard }: Props) {
  const [actionError, setActionError] = useState<string | null>(null);

  // For actions with no form of their own (deletes): show failures in a banner.
  async function run(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(formatError(err));
    }
  }

  // Add and rename throw on failure, so the form that triggered them shows the error.
  async function addColumn(title: string) {
    const col = await api.post<ColumnRecord>("/columns", { board: board.id, title });
    updateBoard((b) => ops.addColumn(b, col));
  }

  async function renameColumn(columnId: number, title: string) {
    const col = await api.patch<ColumnRecord>(`/columns/${columnId}`, { title });
    updateBoard((b) => ops.renameColumn(b, col));
  }

  function deleteColumn(column: Column) {
    const n = column.cards.length;
    const message =
      n > 0
        ? `Delete "${column.title}" and its ${n} card${n === 1 ? "" : "s"}?`
        : `Delete "${column.title}"?`;
    if (!window.confirm(message)) return;
    void run(async () => {
      await api.delete<void>(`/columns/${column.id}`);
      updateBoard((b) => ops.removeColumn(b, column.id));
    });
  }

  async function addCard(columnId: number, title: string) {
    const card = await api.post<Card>("/cards", { column: columnId, title });
    updateBoard((b) => ops.addCard(b, card));
  }

  async function renameCard(cardId: number, title: string) {
    const card = await api.patch<Card>(`/cards/${cardId}`, { title });
    updateBoard((b) => ops.replaceCard(b, card));
  }

  function deleteCard(card: Card) {
    if (!window.confirm(`Delete "${card.title}"?`)) return;
    void run(async () => {
      await api.delete<void>(`/cards/${card.id}`);
      updateBoard((b) => ops.removeCard(b, card.id));
    });
  }

  return (
    <>
      {actionError && (
        <p role="alert" className="error">
          {actionError}
        </p>
      )}

      {board.columns.length === 0 && (
        <p className="empty">This board has no columns yet. Add the first one below.</p>
      )}

      <div className="board-columns">
        {board.columns.map((column) => (
          <BoardColumn
            key={column.id}
            column={column}
            onRenameColumn={renameColumn}
            onDeleteColumn={deleteColumn}
            onAddCard={addCard}
            onRenameCard={renameCard}
            onDeleteCard={deleteCard}
          />
        ))}
        <div className="add-column">
          <AddForm
            label="Add a column"
            placeholder="Column title"
            submitLabel="Add column"
            maxLength={200}
            onSubmit={addColumn}
          />
        </div>
      </div>
    </>
  );
}