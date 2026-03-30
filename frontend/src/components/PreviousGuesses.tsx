import "./PreviousGuesses.css";

interface PreviousGuessesProps {
  rules: string[];
}

export default function PreviousGuesses({ rules }: PreviousGuessesProps) {
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
    </div>
  );
}