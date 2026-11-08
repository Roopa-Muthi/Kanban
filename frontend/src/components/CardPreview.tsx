import type { Card } from "../types";

export function CardPreview({ card }: { card: Card }) {
  return (
    <div className="card card-overlay">
      <p className="card-title">{card.title}</p>
    </div>
  );
}