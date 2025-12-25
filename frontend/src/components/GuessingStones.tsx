import "./GuessingStones.css";
type Props = {
  yours: number;
  others?: number;
};

export default function GuessingStones({ yours, others }: Props) {
  console.log("others", others);
  return (
    <div className="stones card">
      <div className="header">Guessing Stones</div>

      <div className="rowline">
        <span className="lbl">Yours:</span>
        {Array.from({ length: yours }).map((_, i) => (
          <div key={i} className="dot" />
        ))}
      </div>
      {others !== undefined && (
        <div className="rowline">
          <span className="lbl">Models:</span>
          {Array.from({ length: others }).map((_, i) => (
            <div key={i} className="dot" />
          ))}
        </div>
      )}
    </div>
  );
}
