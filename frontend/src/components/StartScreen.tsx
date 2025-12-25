import { useState } from "react";
import "./StartScreen.css";

export type Mode = "single" | "multi";
export type MultiPlayer = "reductive" | "gpt" | "heuristic" | "";

type Props = {
  loading: boolean;
  onStart: (mode: Mode, player: MultiPlayer) => void;
};

export default function StartScreen({ loading, onStart }: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [multiPlayer, setMultiPlayer] = useState<MultiPlayer>("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (mode === "multi" && multiPlayer === "") {
      setError("Bitte einen Multiplayer-Typ auswählen.");
      return;
    }
    if (!mode) {
      setError("Bitte einen Modus auswählen.");
      return;
    }
    setError(null);
    onStart(mode, mode === "multi" ? multiPlayer : "");
  };

  return (
    <div className="start-screen-wrapper">
      <div className="start-screen-inner start-screen container col">
        <h1 className="text-2xl font-semibold">Zendo</h1>
        <p>Start Game</p>
        <div className="start-screen-mode-row">
          <button
            type="button"
            className={`btn ${mode === "single" ? "primary" : "secondary"}`}
            onClick={() => {
              setMode("single");
              setError(null);
            }}
            disabled={loading}
          >
            Single Player
          </button>
          <button
            type="button"
            className={`btn ${mode === "multi" ? "primary" : "secondary"}`}
            onClick={() => {
              setMode("multi");
              setError(null);
            }}
            disabled={loading}
          >
            Multiplayer
          </button>
        </div>

        {/* Multiplayer details */}
        {mode === "multi" && (
          <div className="col" style={{ gap: 8, marginTop: 12 }}>
            <span>Choose player</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                <button
                  type="button"
                  className={`btn ${
                    multiPlayer === "reductive" ? "primary" : "secondary"
                  }`}
                  onClick={() => setMultiPlayer("reductive")}
                  disabled={loading}
                >
                  Reductive Player
                </button>
                <button
                  type="button"
                  className={`btn ${
                    multiPlayer === "gpt" ? "primary" : "secondary"
                  }`}
                  onClick={() => setMultiPlayer("gpt")}
                  disabled={loading}
                >
                  GPT Player
                </button>
                <button
                  type="button"
                  className={`btn ${
                    multiPlayer === "heuristic" ? "primary" : "secondary"
                  }`}
                  onClick={() => setMultiPlayer("heuristic")}
                  disabled={loading}
                >
                  Heuristic Player
                </button>
              </div>
            </div>
          </div>
        )}

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
