import * as actionLog from "../actionLog";
import "./GameOver.css";

type GameOverProps = {
  youWon: boolean;
  rule: string | null;
  message: string | null;
  nextGame: () => void;
};

export default function GameOver({
  youWon,
  rule,
  message,
  nextGame,
}: GameOverProps) {
  return (
    <div className="gameover-wrapper">
      <div className="gameover-card">
        <h2 className="gameover-title">
          {youWon ? "You won! 🎉" : "You lost 😢"}
        </h2>

        {rule && (
          <p className="gameover-text">
            The guessed rule was: <strong>{rule}</strong>
          </p>
        )}

        {!rule && message && <p className="gameover-text">{message}</p>}

        <button className="btn primary gameover-button" onClick={() => { actionLog.log("game_over_next_clicked", { youWon, rule }); nextGame(); }}>
          Finish session
        </button>
      </div>
    </div>
  );
}
