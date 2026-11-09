import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { formatError } from "../api";
import { useAuth } from "../auth/useAuth";
import type { Card, CardChanges } from "../types";

const DESCRIPTION_MAX = 5000;

interface Draft {
  title: string;
  description: string;
  dueDate: string; // "" means no due date
  assignee: number | null;
}

function toDraft(card: Card): Draft {
  return {
    title: card.title,
    description: card.description,
    dueDate: card.due_date ?? "",
    assignee: card.assignee,
  };
}

// Only what differs from the values the dialog opened with.
function diff(base: Draft, draft: Draft): CardChanges {
  const changes: CardChanges = {};
  const title = draft.title.trim();
  if (title !== base.title) changes.title = title;
  if (draft.description !== base.description) changes.description = draft.description;
  if (draft.dueDate !== base.dueDate) changes.due_date = draft.dueDate === "" ? null : draft.dueDate;
  if (draft.assignee !== base.assignee) changes.assignee = draft.assignee;
  return changes;
}

interface Props {
  card: Card;
  onSave: (changes: CardChanges) => Promise<void>;
  onClose: () => void;
}

export function CardModal({ card, onSave, onClose }: Props) {
  const { user } = useAuth();
  const uid = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Whatever had focus when the dialog opened (the "Details" button), so it can get it back.
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [base] = useState<Draft>(() => toDraft(card));
  const [draft, setDraft] = useState<Draft>(base);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    const returnTo = returnFocusRef.current;
    return () => {
      returnTo?.focus();
    };
  }, []);

  const changes = diff(base, draft);
  const dirty = Object.keys(changes).length > 0;
  const titleBlank = draft.title.trim() === "";
  const me = user?.id ?? null;
  const otherAssignee = draft.assignee !== null && draft.assignee !== me ? draft.assignee : null;

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function requestClose() {
    if (busy) return;
    if (dirty && !window.confirm("Discard your changes?")) return;
    onClose();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dirty || titleBlank || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(changes);
      onClose();
    } catch (err) {
      setError(formatError(err));
      setBusy(false);
    }
  }

  const headingId = `${uid}-heading`;

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby={headingId}
      onCancel={(e) => {
        // Escape: ask first if there are unsaved changes.
        e.preventDefault();
        requestClose();
      }}
      onClose={() => {
        // Some browsers close a dialog on a second Escape even after preventDefault.
        // Keep it open: this component, not the browser, decides when it goes away.
        const dialog = dialogRef.current;
        if (dialog && !dialog.open) dialog.showModal();
      }}
      onClick={(e) => {
        // The form fills the dialog, so a click that lands on the dialog itself is the backdrop.
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <form className="modal-body" onSubmit={handleSubmit}>
        <h2 id={headingId}>Card details</h2>

        <div className="field">
          <label htmlFor={`${uid}-title`}>Title</label>
          <input
            id={`${uid}-title`}
            value={draft.title}
            maxLength={300}
            onChange={(e) => update("title", e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor={`${uid}-description`}>Description</label>
          <textarea
            id={`${uid}-description`}
            rows={6}
            value={draft.description}
            maxLength={DESCRIPTION_MAX}
            onChange={(e) => update("description", e.target.value)}
          />
          <span className="hint">
            {draft.description.length} / {DESCRIPTION_MAX}
          </span>
        </div>

        <div className="field">
          <label htmlFor={`${uid}-due`}>Due date</label>
          <div className="field-row">
            <input
              id={`${uid}-due`}
              type="date"
              value={draft.dueDate}
              onChange={(e) => update("dueDate", e.target.value)}
            />
            {draft.dueDate !== "" && (
              <button
                type="button"
                className="link-btn"
                aria-label="Clear due date"
                onClick={() => update("dueDate", "")}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="field">
          <label htmlFor={`${uid}-assignee`}>Assignee</label>
          <select
            id={`${uid}-assignee`}
            value={draft.assignee === null ? "" : String(draft.assignee)}
            onChange={(e) => update("assignee", e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">Unassigned</option>
            {user && <option value={String(user.id)}>Me ({user.username})</option>}
            {otherAssignee !== null && <option value={String(otherAssignee)}>User #{otherAssignee}</option>}
          </select>
        </div>

        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button type="submit" disabled={busy || !dirty || titleBlank}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={requestClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}