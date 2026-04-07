import "./PreviousGuesses.css";

interface PreviousGuessesProps {
  rules: string[];
  /** Optional note shown below the list (e.g. for tutorial context). */
  note?: string;
}

export default function PreviousGuesses({ rules, note }: PreviousGuessesProps) {
  return (
    <div className="prev card">
      <div className="header">Previous Guesses:</div>

      <div className="rules-scroll">
        {rules.length === 0 ? (
          <div className="empty"></div>
        ) : (
          <ul className="rules-list">
            {rules.map((rule, index) => (
              <li key={index}>{rule}</li>
            ))}
          </ul>
        )}
      </div>
      {note && (
        <p style={{ margin: "6px 0 0", fontSize: 11, color: "#718096", lineHeight: 1.4 }}>
          {note}
        </p>
      )}
    </div>
  );
}