import ImagePanel from "../components/ImagePanel";

type Props = { image?: string; onGuess: (label: "YES" | "NO") => void };
export default function GuessLabelScreen({ image, onGuess }: Props) {
  return (
    <div className="row" style={{ gap: 12, height: "100%", minHeight: 0 }}>
      <div className="panel" style={{ flex: 1, padding: 10, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <ImagePanel title="Proposed Image" dataUrl={image} />
      </div>
      <div className="panel" style={{ width: "clamp(140px, 20vw, 260px)", flexShrink: 0, padding: 10 }}>
        <div className="card" style={{ marginBottom: 8 }}>
          <div className="label">Guess the Label:</div>
        </div>
        <div className="col" style={{ gap: 10 }}>
          <button className="btn good" onClick={() => onGuess("YES")}>
            Rule Following
          </button>
          <button className="btn bad" onClick={() => onGuess("NO")}>
            Not Rule Following
          </button>
        </div>
      </div>
    </div>
  );
}
