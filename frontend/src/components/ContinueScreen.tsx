import { useState } from "react";
import * as actionLog from "../actionLog";
import "./StartScreen.css";

export type Mode = "single" | "multi";
export type MultiPlayer = "reductive" | "gpt" | "heuristic" | "";

type Props = {
  loading: boolean;
  onStart: (mode: Mode, player: MultiPlayer, name: string) => void;
};

export default function ContinueScreen({ loading, onStart }: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [multiPlayer, setMultiPlayer] = useState<MultiPlayer>("");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

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
    onStart(mode, mode === "multi" ? multiPlayer : "", name);
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
              placeholder="player_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>
        <div className="start-screen-mode-row">
          
          <button
            type="button"
            className={`btn ${mode === "single" ? "primary" : "secondary"}`}
            onClick={() => {
              actionLog.log("mode_selected", { mode: "single" });
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
              actionLog.log("mode_selected", { mode: "multi" });
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
                  onClick={() => { actionLog.log("player_selected", { player: "reductive" }); setMultiPlayer("reductive"); }}
                  disabled={loading}
                >
                  Reductive Player
                </button>
                <button
                  type="button"
                  className={`btn ${
                    multiPlayer === "gpt" ? "primary" : "secondary"
                  }`}
                  onClick={() => { actionLog.log("player_selected", { player: "gpt" }); setMultiPlayer("gpt"); }}
                  disabled={loading}
                >
                  GPT Player
                </button>
                <button
                  type="button"
                  className={`btn ${
                    multiPlayer === "heuristic" ? "primary" : "secondary"
                  }`}
                  onClick={() => { actionLog.log("player_selected", { player: "heuristic" }); setMultiPlayer("heuristic"); }}
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
