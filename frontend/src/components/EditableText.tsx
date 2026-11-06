
import { useState } from "react";
import type { FormEvent } from "react";
import { formatError } from "../api";

interface Props {
  value: string;
  maxLength: number;
  editLabel: string;
  className?: string;
  headingLevel?: number;
  onSave: (value: string) => Promise<void>;
}

export function EditableText({ value, maxLength, editLabel, className, headingLevel, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function start() {
    setDraft(value);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      cancel();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    const headingProps = headingLevel ? { role: "heading", "aria-level": headingLevel } : {};
    return (
      <span className="editable">
        <span className={className} {...headingProps}>
          {value}
        </span>
        <button type="button" className="link-btn" onClick={start} aria-label={editLabel}>
          Edit
        </button>
      </span>
    );
  }

  return (
    <form className="edit-form" onSubmit={handleSubmit}>
      <input
        autoFocus
        value={draft}
        maxLength={maxLength}
        aria-label={editLabel}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
        }}
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={cancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}