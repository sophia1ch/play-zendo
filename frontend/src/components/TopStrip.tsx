// TopStrip.tsx
import "./TopStrip.css";

type Props = {
  pos: string[];
  neg: string[];
  onImageClick?: (type: "pos" | "neg", index: number) => void;
};

export default function TopStrip({ pos, neg, onImageClick }: Props) {
  return (
    <div className="topstrips row">
      <div className="strip panel col">
        <div className="section-title">Rule Following:</div>
        <div className="thumbs">
          {pos.length === 0 && (
            <div className="thumb placeholder">
              <span>…</span>
            </div>
          )}
          {pos.map((url, i) => (
            <div key={i} className="thumb" onClick={() => onImageClick?.("pos", i)}>
              <img src={url} alt={`yes-${i}`} />
            </div>
          ))}
        </div>
      </div>

      <div className="strip panel col">
        <div className="section-title">Not Rule Following:</div>
        <div className="thumbs">
          {neg.length === 0 && (
            <div className="thumb bad placeholder">
              <span>…</span>
            </div>
          )}
          {neg.map((url, i) => (
            <div
              key={i}
              className="thumb bad"
              onClick={() => onImageClick?.("neg", i)}
            >
              <img src={url} alt={`no-${i}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
