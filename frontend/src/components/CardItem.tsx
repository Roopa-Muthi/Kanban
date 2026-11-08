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
  onRename: (title: string) => Promise<void>;
  onDelete: () => void;
}

export function CardItem({ card, dragDisabled, onRename, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: cardKey(card.id), disabled: dragDisabled });

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
    <li ref={setNodeRef} style={style} className="card">
      <div className="card-row">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="drag-handle"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${card.title}`}
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
      <button
        type="button"
        className="link-btn danger"
        onClick={onDelete}
        aria-label={`Delete ${card.title}`}
      >
        Delete
      </button>
    </li>
  );
}