import ImagePanel from "../components/ImagePanel";

type Props = {
  image?: string;
  onGuess: (label: "YES" | "NO") => void;
  /** Tutorial only: when provided, the correct answer is pre-determined and the
   *  wrong button is disabled so the player can only confirm the correct label. */
  correctLabel?: "YES" | "NO";
};
export default function GuessLabelScreen({ image, onGuess, correctLabel }: Props) {
  return (
    <div className="row" style={{ gap: 12, height: "100%", minHeight: 0 }}>
      <div className="panel" style={{ flex: 1, padding: 10, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <ImagePanel title="Proposed Image" dataUrl={image} />
      </div>
      <div className="panel" style={{ width: "clamp(140px, 20vw, 260px)", flexShrink: 0, padding: 10 }}>
        <div className="card" style={{ marginBottom: 8 }}>
          <div className="label">Guess the Label:</div>
        </div>
        {correctLabel !== undefined && (
          <div style={{ fontSize: 12, color: "#718096", marginBottom: 10, fontStyle: "italic", lineHeight: 1.4 }}>
            In the real game you would guess — here the correct answer is already highlighted for you.
          </div>
        )}
        <div className="col" style={{ gap: 10 }}>
          <button
            className={`btn good${correctLabel === "YES" ? " tutorial-correct" : ""}`}
            onClick={() => onGuess("YES")}
            disabled={correctLabel !== undefined && correctLabel !== "YES"}
          >
            Rule Following
          </button>
          <button
            className={`btn bad${correctLabel === "NO" ? " tutorial-correct" : ""}`}
            onClick={() => onGuess("NO")}
            disabled={correctLabel !== undefined && correctLabel !== "NO"}
          >
            Not Rule Following
          </button>
        </div>
      </div>
    </div>
  );
}
