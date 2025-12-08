import { useState } from "react";

type Props = {
  loading: boolean;
  onStart: (idx: number) => void;
};

export default function StartScreen({ loading, onStart }: Props) {
  const [value, setValue] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const handleStart = () => {
    const trimmed = value.trim();
    if (trimmed === "") {
      setError("Bitte eine Zahl eingeben.");
      return;
    }

    const num = Number(trimmed);
    if (!Number.isFinite(num) || !Number.isInteger(num)) {
      setError("Bitte eine ganze Zahl eingeben.");
      return;
    }

    setError(null);
    onStart(num);
  };

  return (
    <div className="start-screen container col" style={{ gap: 16 }}>
      <h1 className="text-2xl font-semibold">Zendo</h1>
      <p>Start Game</p>

      <label className="col" htmlFor="taskIndex" style={{ gap: 8 }}>
        <span>Task index</span>
        <input
          id="taskIndex"
          type="number"
          step={1}
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleStart();
          }}
          disabled={loading}
          className="input"
          aria-invalid={!!error}
          aria-describedby={error ? "taskIndex-error" : undefined}
        />
      </label>

      {error && (
        <div id="taskIndex-error" className="text-red-600 text-sm">
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn primary"
          onClick={handleStart}
          disabled={loading}
        >
          {loading ? "Initializing game..." : "Start"}
        </button>
      </div>

      {loading && <div className="spinner">Loading initial examples...</div>}
    </div>
  );
}
