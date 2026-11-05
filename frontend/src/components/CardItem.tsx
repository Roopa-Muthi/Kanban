import type { Card } from "../types";

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

export function CardItem({ card }: { card: Card }) {
  const due = card.due_date ? parseDay(card.due_date) : null;
  const overdue = due !== null && due < startOfToday();

  return (
    <li className="card">
      <p className="card-title">{card.title}</p>
      {card.description && <p className="card-desc">{card.description}</p>}
      {due && (
        <p className={overdue ? "card-meta overdue" : "card-meta"}>
          Due{" "}
          {due.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
          {overdue && " (overdue)"}
        </p>
      )}
    </li>
  );
}