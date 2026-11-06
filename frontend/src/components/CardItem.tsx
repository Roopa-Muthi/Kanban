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
  onRename: (title: string) => Promise<void>;
  onDelete: () => void;
}

export function CardItem({ card, onRename, onDelete }: Props) {
  const due = card.due_date ? parseDay(card.due_date) : null;
  const overdue = due !== null && due < startOfToday();

  return (
    <li className="card">
      <EditableText
        value={card.title}
        maxLength={300}
        editLabel={`Edit title of ${card.title}`}
        className="card-title"
        onSave={onRename}
      />
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