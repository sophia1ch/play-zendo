import "./ImagePreview.css";

type Props = { dataUrl: string; onRender: () => void };
export default function ImagePreview({ dataUrl, onRender }: Props) {
  return (
    <div className="imgprev card">
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "center" }}
      >
        <div className="title">Gerendertes Bild</div>
        <button className="btn" onClick={onRender}>
          Neu rendern
        </button>
      </div>
      <div className="frame">
        {dataUrl ? (
          <img src={dataUrl} alt="render" />
        ) : (
          <div className="placeholder">Kein Bild</div>
        )}
      </div>
    </div>
  );
}
