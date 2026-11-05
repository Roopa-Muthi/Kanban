import type { Column } from "../types";
import { CardItem } from "./CardItem";

export function BoardColumn({ column }: { column: Column }) {
  return (
    <section className="column" aria-label={column.title}>
      <header className="column-header">
        <h2>{column.title}</h2>
        <span className="count">{column.cards.length}</span>
      </header>
      {column.cards.length === 0 ? (
        <p className="empty">No cards yet</p>
      ) : (
        <ul className="card-list">
          {column.cards.map((card) => (
            <CardItem key={card.id} card={card} />
          ))}
        </ul>
      )}
    </section>
  );
}