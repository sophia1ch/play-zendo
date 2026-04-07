import "./GuessingStones.css";
type Props = {
  yours: number;
  others?: number;
  /** Optional note shown below the counter (e.g. for tutorial context). */
  note?: string;
};

export default function GuessingStones({ yours, others, note }: Props) {
  console.log("others", others);
  return (
    <div className="stones card">
      <div className="header">Allowed Guesses:</div>

      <div className="rowline">
        {/* {Array.from({ length: yours }).map((_, i) => (
          <div key={i} className="dot" />
        ))} */}
        <h4 style={{ margin: 0 }}>{yours}</h4>
      </div>
      {others !== undefined && (
        <div className="rowline">
          <span className="lbl">Models:</span>
          {Array.from({ length: others }).map((_, i) => (
            <div key={i} className="dot" />
          ))}
        </div>
      )}
      {note && (
        <p style={{ margin: "6px 0 0", fontSize: 11, color: "#718096", lineHeight: 1.4 }}>
          {note}
        </p>
      )}
    </div>
  );
}
