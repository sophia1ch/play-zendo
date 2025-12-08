import "./GuessingStones.css";
type Props = {
  yours: number; // Anzahl Stones des Users
  others?: Record<number, number>; // optional: Stones des Modells
};

export default function GuessingStones({ yours, others }: Props) {
  return (
    <div className="stones card">
      <div className="header">Guessing Stones</div>

      <div className="rowline">
        <span className="lbl">Yours:</span>
        {Array.from({ length: yours }).map((_, i) => (
          <div key={i} className="dot" />
        ))}
      </div>

      <div className="rowline">
        <span className="lbl">Models:</span>
        {Array.from({ length: others ? others[0] : 0 }).map((_, i) => (
          <div key={i} className="dot" />
        ))}
      </div>
    </div>
  );
}
