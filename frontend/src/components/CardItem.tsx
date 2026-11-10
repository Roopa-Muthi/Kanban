import { useCallback, useEffect, useRef } from "react";
import type { FocusEvent, KeyboardEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cardKey } from "../dnd";
import type { Card } from "../types";
import { EditableText } from "./EditableText";

// due_date is "YYYY-MM-DD". Parse the parts by hand: new Date("2026-11-05") is read as UTC
// and can display the wrong day in some time zones.
function parseDay(iso: string): Date | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

interface Props {
  card: Card;
  dragDisabled: boolean;
  grabbed: boolean;
  onRename: (title: string) => Promise<void>;
  onOpen: () => void;
  onDelete: () => void;
  onHandleKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  onHandleBlur: (e: FocusEvent<HTMLButtonElement>) => void;
}

export function CardItem({
  card,
  dragDisabled,
  grabbed,
  onRename,
  onOpen,
  onDelete,
  onHandleKeyDown,
  onHandleBlur,
}: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: cardKey(card.id), disabled: dragDisabled });

  const handleRef = useRef<HTMLButtonElement | null>(null);
  const setHandleRef = useCallback(
    (node: HTMLButtonElement | null) => {
      handleRef.current = node;
      setActivatorNodeRef(node);
    },
    [setActivatorNodeRef],
  );

  // While this card is picked up with the keyboard, keep focus on its handle. Moving a card
  // to another column re-creates it, which would otherwise drop focus.
  useEffect(() => {
    if (grabbed) handleRef.current?.focus();
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: "relative" as const,
    zIndex: isDragging ? 1 : undefined,
    opacity: isDragging ? 0.6 : 1,
  };

  const due = card.due_date ? parseDay(card.due_date) : null;
  const overdue = due !== null && due < startOfToday();

  return (
    <li ref={setNodeRef} style={style} className={grabbed ? "card grabbed" : "card"}>
      <div className="card-row">
        <button
          type="button"
          ref={setHandleRef}
          className="drag-handle"
          {...attributes}
          {...listeners}
          aria-pressed={grabbed}
          aria-roledescription={undefined}
          aria-label={`Reorder ${card.title}`}
          onKeyDown={onHandleKeyDown}
          onBlur={onHandleBlur}
        >
          ⠿
        </button>
        <EditableText
          value={card.title}
          maxLength={300}
          editLabel={`Edit title of ${card.title}`}
          className="card-title"
          onSave={onRename}
        />
      </div>
      {card.description && <p className="card-desc">{card.description}</p>}
      {due && (
        <p className={overdue ? "card-meta overdue" : "card-meta"}>
          Due{" "}
          {due.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
          {overdue && " (overdue)"}
        </p>
      )}
      <div className="card-actions">
        <button
          type="button"
          className="link-btn"
          onClick={onOpen}
          aria-label={`Open details for ${card.title}`}
        >
          Details
        </button>
        <button
          type="button"
          className="link-btn danger"
          onClick={onDelete}
          aria-label={`Delete ${card.title}`}
        >
          Delete
        </button>
      </div>
    </li>
  );
}