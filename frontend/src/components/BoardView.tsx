import { useCallback, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type {
  CollisionDetection,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { api, formatError } from "../api";
import * as ops from "../boardOps";
import {
  buildLayout,
  cardKey,
  columnOfOver,
  findColumnOf,
  parseCardKey,
  parseColumnKey,
  sameOrder,
} from "../dnd";
import type { Layout } from "../dnd";
import type { BoardDetail, Card, Column, ColumnRecord } from "../types";
import { AddForm } from "./AddForm";
import { BoardColumn } from "./BoardColumn";
import { CardPreview } from "./CardPreview";

interface Props {
  board: BoardDetail;
  updateBoard: (fn: (board: BoardDetail) => BoardDetail) => void;
  onResync: () => Promise<void>;
}

interface DragState {
  cardId: number;
  start: Layout; // where everything was when the drag began
  layout: Layout; // live preview while dragging
}

interface MoveRequest {
  cardId: number;
  columnId: number;
  beforeId: number | null; // the card that will sit directly above
  afterId: number | null; // the card that will sit directly below
}

export function BoardView({ board, updateBoard, onResync }: Props) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pending, setPending] = useState(0);
  const [resyncing, setResyncing] = useState(false);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const epochRef = useRef(0);

  const sensors = useSensors(
    // A small distance means a plain click on the handle never starts a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Prefer the card under the pointer. If the pointer is over a column's empty space, pick the
  // nearest card in that column, or the column itself when it has no cards.
  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const hits = pointerWithin(args);
      const collisions = hits.length > 0 ? hits : rectIntersection(args);
      const overId = getFirstCollision(collisions, "id");
      if (overId === null) return [];

      const columnId = parseColumnKey(overId);
      if (columnId !== null) {
        const ids = drag?.layout[columnId] ?? [];
        if (ids.length > 0) {
          const keys = new Set(ids.map(cardKey));
          const closest = closestCenter({
            ...args,
            droppableContainers: args.droppableContainers.filter((c) => keys.has(String(c.id))),
          });
          const first = closest[0];
          if (first) return [first];
        }
      }
      return [{ id: overId }];
    },
    [drag],
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

  // ---------- moves: applied optimistically, saved one at a time, in order ----------

  function enqueueMove(move: MoveRequest) {
    const epoch = epochRef.current;
    setPending((n) => n + 1);
    queueRef.current = queueRef.current.then(async () => {
      try {
        // An earlier move failed and the board is being resynced; skip anything queued behind it.
        if (epoch !== epochRef.current) return;
        const moved = await api.post<Card>(`/cards/${move.cardId}/move`, {
          column_id: move.columnId,
          before_id: move.beforeId,
          after_id: move.afterId,
        });
        updateBoard((b) => ops.syncCard(b, moved));
      } catch (err) {
        epochRef.current += 1;
        setResyncing(true);
        let message = `Couldn't save the move. ${formatError(err)}`;
        try {
          await onResync();
          message += " The board was reloaded to match what's saved.";
        } catch {
          message += " Reload the page to see what was saved.";
        }
        setActionError(message);
        setResyncing(false);
      } finally {
        setPending((n) => n - 1);
      }
    });
  }

  // ---------- drag and drop ----------

  function handleDragStart({ active }: DragStartEvent) {
    const cardId = parseCardKey(active.id);
    if (cardId === null) return;
    const start = buildLayout(board.columns);
    setDrag({ cardId, start, layout: start });
    setActionError(null);
  }

  // Preview only: when the card crosses into another column, move it there in the layout.
  function handleDragOver({ active, over }: DragOverEvent) {
    if (!drag || !over) return;
    const cardId = parseCardKey(active.id);
    if (cardId === null) return;

    const from = findColumnOf(drag.layout, cardId);
    const to = columnOfOver(drag.layout, over.id);
    if (from === null || to === null || from === to) return;

    const source = (drag.layout[from] ?? []).filter((id) => id !== cardId);
    const target = [...(drag.layout[to] ?? [])];
    const overCardId = parseCardKey(over.id);
    let index = target.length; // over the column itself: append
    if (overCardId !== null) {
      const translated = active.rect.current.translated;
      const below = translated !== null && translated.top > over.rect.top + over.rect.height / 2;
      index = target.indexOf(overCardId) + (below ? 1 : 0);
    }
    target.splice(index, 0, cardId);
    setDrag({ ...drag, layout: { ...drag.layout, [from]: source, [to]: target } });
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const current = drag;
    setDrag(null); // the preview ends; the real board is updated below
    if (!current || !over) return; // dropped outside everything: nothing changes

    const cardId = parseCardKey(active.id);
    if (cardId === null) return;
    const columnId = findColumnOf(current.layout, cardId);
    if (columnId === null) return;

    let ids = current.layout[columnId] ?? [];
    const overCardId = parseCardKey(over.id);
    if (overCardId !== null && overCardId !== cardId && ids.includes(overCardId)) {
      ids = arrayMove(ids, ids.indexOf(cardId), ids.indexOf(overCardId));
    }

    // Dropped back where it started: no request.
    const startColumn = findColumnOf(current.start, cardId);
    if (startColumn === columnId && sameOrder(current.start[columnId] ?? [], ids)) return;

    const index = ids.indexOf(cardId);
    updateBoard((b) => ops.placeCard(b, cardId, columnId, ids)); // optimistic, before any await
    enqueueMove({
      cardId,
      columnId,
      beforeId: ids[index - 1] ?? null,
      afterId: ids[index + 1] ?? null,
    });
  }

  function handleDragCancel() {
    setDrag(null);
  }

  // While dragging, show the preview layout instead of the saved board.
  const cardsById = new Map(
    board.columns.flatMap((c) => c.cards).map((c): [number, Card] => [c.id, c]),
  );
  const columns: Column[] = drag
    ? board.columns.map((column) => ({
        ...column,
        cards: (drag.layout[column.id] ?? [])
          .map((id) => cardsById.get(id))
          .filter((c): c is Card => c !== undefined),
      }))
    : board.columns;
  const draggedCard = drag ? cardsById.get(drag.cardId) : undefined;

  return (
    <>
      {actionError && (
        <p role="alert" className="error">
          {actionError}
        </p>
      )}

      <p className="saving" aria-live="polite">
        {pending > 0 ? "Saving…" : ""}
      </p>

      {board.columns.length === 0 && (
        <p className="empty">This board has no columns yet. Add the first one below.</p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="board-columns">
          {columns.map((column) => (
            <BoardColumn
              key={column.id}
              column={column}
              dragDisabled={resyncing}
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
        <DragOverlay>{draggedCard ? <CardPreview card={draggedCard} /> : null}</DragOverlay>
      </DndContext>
    </>
  );
}