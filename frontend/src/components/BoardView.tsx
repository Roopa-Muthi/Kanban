import { useCallback, useEffect, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent } from "react";
import {
  DndContext,
  DragOverlay,
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
import { api, formatError } from "../api";
import * as ops from "../boardOps";
import {
  buildLayout,
  cardKey,
  describePlacement,
  parseCardKey,
  parseColumnKey,
  planMove,
  previewLayout,
  stepLayout,
} from "../dnd";
import type { Layout, Step } from "../dnd";
import type { BoardDetail, Card, CardChanges, Column, ColumnRecord } from "../types";
import { AddForm } from "./AddForm";
import { BoardColumn } from "./BoardColumn";
import { CardModal } from "./CardModal";
import { CardPreview } from "./CardPreview";

const KEYBOARD_INSTRUCTIONS =
  "Press Space or Enter to pick this card up. Use the arrow keys to move it: up and down " +
  "within a column, left and right between columns. Press Space or Enter to drop it, or " +
  "Escape to cancel.";

const STEP_KEYS: Record<string, Step> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

interface Props {
  board: BoardDetail;
  updateBoard: (fn: (board: BoardDetail) => BoardDetail) => void;
  onResync: () => Promise<void>;
}

interface DragState {
  cardId: number;
  start: Layout; // where everything was when the drag (or pick-up) began
  layout: Layout; // live preview
}

interface MoveRequest {
  cardId: number;
  columnId: number;
  beforeId: number | null; // the card that will sit directly above
  afterId: number | null; // the card that will sit directly below
}

export function BoardView({ board, updateBoard, onResync }: Props) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null); // pointer drag preview
  const [grab, setGrab] = useState<DragState | null>(null); // keyboard pick-up preview
  const [announcement, setAnnouncement] = useState("");
  const [openCardId, setOpenCardId] = useState<number | null>(null);
  const [pending, setPending] = useState(0);
  const [resyncing, setResyncing] = useState(false);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const epochRef = useRef(0);

  const sensors = useSensors(
    // A small distance means a plain click on the handle never starts a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // A pick-up is only valid while focus stays on the card, so any pointer press cancels it.
  const grabbing = grab !== null;
  useEffect(() => {
    if (!grabbing) return;
    const cancel = () => {
      setGrab(null);
      setAnnouncement("Move cancelled.");
    };
    document.addEventListener("pointerdown", cancel, true);
    return () => document.removeEventListener("pointerdown", cancel, true);
  }, [grabbing]);

  const cardsById = new Map(
    board.columns.flatMap((c) => c.cards).map((c): [number, Card] => [c.id, c]),
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
    updateBoard((b) => ops.mergeCardFields(b, card));
  }

  // Throws on failure, so the dialog that triggered it shows the error and stays open.
  async function saveCardDetails(cardId: number, changes: CardChanges) {
    const card = await api.patch<Card>(`/cards/${cardId}`, changes);
    updateBoard((b) => ops.mergeCardFields(b, card));
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
        setGrab(null); // a pick-up built from the old board would be stale after the reload
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

  // ---------- pointer drag and drop ----------

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
    const translated = active.rect.current.translated;
    const below = translated !== null && translated.top > over.rect.top + over.rect.height / 2;
    const next = previewLayout(drag.layout, cardId, over.id, below);
    if (next) setDrag({ ...drag, layout: next });
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const current = drag;
    setDrag(null); // the preview ends; the real board is updated below
    if (!current || !over) return; // dropped outside everything: nothing changes

    const cardId = parseCardKey(active.id);
    if (cardId === null) return;
    const plan = planMove(current.start, current.layout, cardId, over.id);
    if (!plan) return;

    updateBoard((b) => ops.placeCard(b, cardId, plan.columnId, plan.ids)); // optimistic, before any await
    enqueueMove({
      cardId,
      columnId: plan.columnId,
      beforeId: plan.beforeId,
      afterId: plan.afterId,
    });
  }

  function handleDragCancel() {
    setDrag(null);
  }

  // ---------- keyboard: pick up, step, drop ----------

  function cancelGrab(message: string) {
    setGrab(null);
    setAnnouncement(message);
  }

  function pickUp(card: Card) {
    if (drag || resyncing) return;
    const start = buildLayout(board.columns);
    setGrab({ cardId: card.id, start, layout: start });
    setActionError(null);
    setAnnouncement(
      `Picked up ${card.title}, ${describePlacement(start, board.columns, card.id) ?? "on the board"}. ` +
        "Use the arrow keys to move it, Space to drop it, Escape to cancel.",
    );
  }

  function stepGrab(step: Step) {
    if (!grab) return;
    const columnIds = board.columns.map((c) => c.id);
    const next = stepLayout(grab.layout, columnIds, grab.cardId, step);
    if (!next) {
      setAnnouncement(`Can't move any further ${step}.`);
      return;
    }
    setGrab({ ...grab, layout: next });
    setAnnouncement(
      `Moved to ${describePlacement(next, board.columns, grab.cardId) ?? "a new place"}.`,
    );
  }

  function dropGrab() {
    const current = grab;
    if (!current) return;
    setGrab(null);
    const title = cardsById.get(current.cardId)?.title ?? "card";
    const plan = planMove(current.start, current.layout, current.cardId, cardKey(current.cardId));
    if (!plan) {
      setAnnouncement(`Dropped ${title}. Nothing changed.`);
      return;
    }
    updateBoard((b) => ops.placeCard(b, current.cardId, plan.columnId, plan.ids)); // optimistic
    enqueueMove({
      cardId: current.cardId,
      columnId: plan.columnId,
      beforeId: plan.beforeId,
      afterId: plan.afterId,
    });
    const where = describePlacement(current.layout, board.columns, current.cardId);
    setAnnouncement(`Dropped ${title} at ${where ?? "its new place"}.`);
  }

  function handleHandleKeyDown(card: Card, e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (grab?.cardId === card.id) dropGrab();
      else pickUp(card);
      return;
    }
    if (grab?.cardId !== card.id) return;
    if (e.key === "Escape") {
      e.preventDefault();
      cancelGrab("Move cancelled.");
      return;
    }
    const step = STEP_KEYS[e.key];
    if (step) {
      e.preventDefault();
      stepGrab(step);
    }
  }

  // relatedTarget is null when the button was merely re-rendered or moved, which is not the
  // user leaving. Only a real jump to another element (Tab) cancels the pick-up.
  function handleHandleBlur(card: Card, e: FocusEvent<HTMLButtonElement>) {
    if (grab?.cardId === card.id && e.relatedTarget !== null) cancelGrab("Move cancelled.");
  }

  // While dragging or holding a card, show the preview layout instead of the saved board.
  const preview = drag ?? grab;
  const columns: Column[] = preview
    ? board.columns.map((column) => ({
        ...column,
        cards: (preview.layout[column.id] ?? [])
          .map((id) => cardsById.get(id))
          .filter((c): c is Card => c !== undefined),
      }))
    : board.columns;
  const draggedCard = drag ? cardsById.get(drag.cardId) : undefined;
  // The dialog reads the saved board, never a preview.
  const openCard = openCardId === null ? undefined : cardsById.get(openCardId);

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

      <p className="keyboard-hint">
        Keyboard: focus a card's ⠿ handle, press Space to pick it up, use the arrow keys to move
        it, then Space to drop it. Escape cancels.
      </p>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {announcement}
      </div>

      {board.columns.length === 0 && (
        <p className="empty">This board has no columns yet. Add the first one below.</p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        accessibility={{ screenReaderInstructions: { draggable: KEYBOARD_INSTRUCTIONS } }}
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
              grabbedCardId={grab?.cardId ?? null}
              onRenameColumn={renameColumn}
              onDeleteColumn={deleteColumn}
              onAddCard={addCard}
              onRenameCard={renameCard}
              onOpenCard={(card) => setOpenCardId(card.id)}
              onDeleteCard={deleteCard}
              onHandleKeyDown={handleHandleKeyDown}
              onHandleBlur={handleHandleBlur}
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

      {openCard && (
        <CardModal
          key={openCard.id}
          card={openCard}
          onSave={(changes) => saveCardDetails(openCard.id, changes)}
          onClose={() => setOpenCardId(null)}
        />
      )}
    </>
  );
}