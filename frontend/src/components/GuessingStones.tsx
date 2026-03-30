import "./GuessingStones.css";
type Props = {
  yours: number;
  others?: number;
};

export default function GuessingStones({ yours, others }: Props) {
  console.log("others", others);
  return (
    <div className="stones card">
      <div className="header">Allowed Guesses:</div>

      <div className="rowline">
        {/* {Array.from({ length: yours }).map((_, i) => (
          <div key={i} className="dot" />
        ))} */}
        <h3 style={{ margin: 0 }}>{yours}</h3>
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
