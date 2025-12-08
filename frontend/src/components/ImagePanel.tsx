import "./ImagePanel.css";

type Props = { title: string; dataUrl?: string };
export default function ImagePanel({ title, dataUrl }: Props) {
  return (
    <div className="imagepanel card">
      <div className="header">{title}</div>
      <div className="frame">
        {dataUrl ? <img src={dataUrl} alt="img" /> : <div className="ph" />}
      </div>
    </div>
  );
}
