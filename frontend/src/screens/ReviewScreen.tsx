import ImagePanel from "../components/ImagePanel";

type Props = {
  image?: string;
  onFollowsRule: () => void;
  onNotFollowsRule: () => void;
  onRetry?: () => void;
};
export default function ReviewScreen({
  image,
  onFollowsRule,
  onNotFollowsRule,
  onRetry,
}: Props) {
  return (
    <div className="row" style={{ gap: 12, height: "100%", minHeight: 0 }}>
      <div className="panel" style={{ flex: 1, padding: 10, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <ImagePanel title="Rendered Image" dataUrl={image} />
      </div>
      <div className="panel" style={{ width: "clamp(140px, 20vw, 260px)", flexShrink: 0, padding: 10 }}>
        <div className="col" style={{ gap: 10, marginTop: 10 }}>
          <button className="btn" onClick={onRetry} disabled={!onRetry}>
            Retry
          </button>
          <button className="btn good" onClick={onFollowsRule}>
            Follows the rule
          </button>
          <button className="btn bad" onClick={onNotFollowsRule}>
            Does not follow the rule
          </button>
        </div>
      </div>
    </div>
  );
}
