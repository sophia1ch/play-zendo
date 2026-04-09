import { useRef, useState } from "react";
import "./PlayerNotes.css";

interface Props {
  notes: string;
  onChange: (notes: string) => void;
  /** Shown below the toggle button, e.g. for tutorial or instructions context. */
  hint?: string;
}

export default function PlayerNotes({ notes, onChange, hint }: Props) {
  const [open, setOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value);
    // Auto-grow: reset to auto first so shrinking also works
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  return (
    <div className="player-notes card">
      <div className="notes-header">
        <button className="notes-toggle" onClick={() => setOpen((o) => !o)}>
          Make Notes <span className="notes-chevron">{open ? "▲" : "▼"}</span>
        </button>
        {hint && <p className="notes-hint">{hint}</p>}
      </div>
      <div className={`notes-dropdown${open ? "" : " notes-dropdown--hidden"}`}>
        <textarea
          ref={textareaRef}
          className="notes-textarea"
          value={notes}
          onChange={handleChange}
          placeholder="Write your observations here…"
        />
      </div>
    </div>
  );
}
