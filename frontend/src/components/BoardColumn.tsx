import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { FocusEvent, KeyboardEvent } from "react";
import { cardKey, columnKey } from "../dnd";
import type { Card, Column } from "../types";
import { AddForm } from "./AddForm";
import { CardItem } from "./CardItem";
import { EditableText } from "./EditableText";

interface Props {
  column: Column;
  dragDisabled: boolean;
  grabbedCardId: number | null;
  onRenameColumn: (columnId: number, title: string) => Promise<void>;
  onDeleteColumn: (column: Column) => void;
  onAddCard: (columnId: number, title: string) => Promise<void>;
  onRenameCard: (cardId: number, title: string) => Promise<void>;
  onOpenCard: (card: Card) => void;
  onDeleteCard: (card: Card) => void;
  onHandleKeyDown: (card: Card, e: KeyboardEvent<HTMLButtonElement>) => void;
  onHandleBlur: (card: Card, e: FocusEvent<HTMLButtonElement>) => void;
}

export function BoardColumn({
  column,
  dragDisabled,
  grabbedCardId,
  onRenameColumn,
  onDeleteColumn,
  onAddCard,
  onRenameCard,
  onOpenCard,
  onDeleteCard,
  onHandleKeyDown,
  onHandleBlur,
}: Props) {
  // Makes the whole column a drop target, so an empty column can receive a card.
  const { setNodeRef } = useDroppable({ id: columnKey(column.id) });

  return (
    <section ref={setNodeRef} className="column" aria-label={column.title}>
      <header className="column-header">
        <EditableText
          value={column.title}
          maxLength={200}
          editLabel={`Edit name of column ${column.title}`}
          className="column-title"
          headingLevel={2}
          onSave={(title) => onRenameColumn(column.id, title)}
        />
        <span className="count">{column.cards.length}</span>
        <button
          type="button"
          className="link-btn danger"
          onClick={() => onDeleteColumn(column)}
          aria-label={`Delete column ${column.title}`}
        >
          Delete
        </button>
      </header>

      <SortableContext
        items={column.cards.map((c) => cardKey(c.id))}
        strategy={verticalListSortingStrategy}
      >
        {column.cards.length === 0 ? (
          <p className="empty">No cards yet</p>
        ) : (
          <ul className="card-list">
            {column.cards.map((card) => (
              <CardItem
                key={card.id}
                card={card}
                dragDisabled={dragDisabled}
                grabbed={card.id === grabbedCardId}
                onRename={(title) => onRenameCard(card.id, title)}
                onOpen={() => onOpenCard(card)}
                onDelete={() => onDeleteCard(card)}
                onHandleKeyDown={(e) => onHandleKeyDown(card, e)}
                onHandleBlur={(e) => onHandleBlur(card, e)}
              />
            ))}
          </ul>
        )}
      </SortableContext>

      <AddForm
        label="Add a card"
        placeholder="Card title"
        submitLabel="Add card"
        maxLength={300}
        onSubmit={(title) => onAddCard(column.id, title)}
      />
    </section>
  );
}