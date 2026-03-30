import { useState } from "react";
import * as actionLog from "../actionLog";
import "./StartScreen.css";

export type Mode = "single" | "multi";
export type MultiPlayer = "reductive" | "gpt" | "heuristic" | "";

type Props = {
  loading: boolean;
  onStart: (mode: Mode, player: MultiPlayer, name: string) => void;
};

export default function StartScreen({ loading, onStart }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  const handleSubmit = () => {
    if (!name.trim()) {
      setError("Please enter your participant ID.");
      return;
    }
    setError(null);
    actionLog.log("game_started", { mode: "single", name });
    onStart("single", "", name.trim());
  };

  return (
    <div className="start-screen-wrapper">
      <div className="start-screen-inner start-screen container col">
        <h1 className="text-2xl font-semibold">Zendo</h1>
        <h3>Start Game</h3>

        <div className="start-screen-name-row">
          <span className="start-screen-label">Enter your participant ID</span>
          <div className="start-screen-mode-row">
            <input
              type="text"
              placeholder="participant_id"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        {error && (
          <div className="text-red-600 text-sm" style={{ marginTop: 8 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button
            className="btn primary"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? "Initializing game..." : "Start"}
          </button>
        </div>

        {loading && <div className="spinner">Loading initial examples...</div>}
      </div>
    </div>
  );
}
