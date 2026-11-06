import { useState } from "react";
import type { FormEvent } from "react";
import { formatError } from "../api";

interface Props {
  label: string;
  placeholder: string;
  submitLabel: string;
  maxLength: number;
  onSubmit: (title: string) => Promise<void>;
}

export function AddForm({ label, placeholder, submitLabel, maxLength, onSubmit }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setTitle("");
    setError(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      setTitle("");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="add-btn" onClick={() => setOpen(true)}>
        + {label}
      </button>
    );
  }

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <input
        autoFocus
        value={title}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={maxLength}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" disabled={busy || title.trim() === ""}>
          {busy ? "Adding…" : submitLabel}
        </button>
        <button type="button" onClick={close}>
          Cancel
        </button>
      </div>
    </form>
  );
}