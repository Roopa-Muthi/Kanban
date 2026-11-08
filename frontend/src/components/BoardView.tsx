import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { api, formatError } from "../api";
import * as ops from "../boardOps";
import { parseCardKey } from "../dnd";
import type { BoardDetail, Card, Column, ColumnRecord } from "../types";
import { AddForm } from "./AddForm";
import { BoardColumn } from "./BoardColumn";

interface Props {
  board: BoardDetail;
  updateBoard: (fn: (board: BoardDetail) => BoardDetail) => void;
}

export function BoardView({ board, updateBoard }: Props) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [movingCardId, setMovingCardId] = useState<number | null>(null);

  const sensors = useSensors(
    // A small distance means a plain click on the handle never starts a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const cardId = parseCardKey(active.id);
    const overCardId = parseCardKey(over.id);
    if (cardId === null || overCardId === null) return;

    // Same-column only today: the target card must live in the dragged card's column.
    const column = board.columns.find((c) => c.cards.some((x) => x.id === cardId));
    if (!column || !column.cards.some((x) => x.id === overCardId)) return;

    const oldIds = column.cards.map((c) => c.id);
    const newIds = arrayMove(oldIds, oldIds.indexOf(cardId), oldIds.indexOf(overCardId));
    const index = newIds.indexOf(cardId);
    const beforeId = newIds[index - 1] ?? null; // the card directly above
    const afterId = newIds[index + 1] ?? null; // the card directly below

    // Optimistic: reorder immediately. This runs before the first await, so there's no flicker.
    updateBoard((b) => ops.setCardOrder(b, column.id, newIds));
    setMovingCardId(cardId);
    setActionError(null);
    try {
      const moved = await api.post<Card>(`/cards/${cardId}/move`, {
        column_id: column.id,
        before_id: beforeId,
        after_id: afterId,
      });
      updateBoard((b) => ops.replaceCard(b, moved)); // picks up the new version
    } catch (err) {
      updateBoard((b) => ops.setCardOrder(b, column.id, oldIds)); // roll back
      setActionError(`Couldn't move the card: ${formatError(err)}`);
    } finally {
      setMovingCardId(null);
    }
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

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(event) => void handleDragEnd(event)}
      >
        <div className="board-columns">
          {board.columns.map((column) => (
            <BoardColumn
              key={column.id}
              column={column}
              dragDisabled={movingCardId !== null}
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
      </DndContext>
    </>
  );
}