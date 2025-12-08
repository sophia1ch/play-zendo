import ImagePanel from "../components/ImagePanel";

type Props = {
  image?: string;
  onQuiz: () => void;
  onTell: () => void;
  onRetry?: () => void;
};
export default function ReviewScreen({
  image,
  onQuiz,
  onTell,
  onRetry,
}: Props) {
  return (
    <div className="row" style={{ gap: 12 }}>
      <div className="panel" style={{ flex: 1, padding: 10 }}>
        <ImagePanel title="Rendered Image" dataUrl={image} />
      </div>
      <div className="panel" style={{ width: 260, padding: 10 }}>
        <div className="col" style={{ gap: 10, marginTop: 10 }}>
          <button className="btn" onClick={onRetry} disabled={!onRetry}>
            Retry
          </button>
          <button className="btn" onClick={onQuiz}>
            Quiz
          </button>
          <button className="btn" onClick={onTell}>
            Tell
          </button>
        </div>
      </div>
    </div>
  );
}
