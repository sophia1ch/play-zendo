import * as actionLog from "../actionLog";
import "./GameOver.css";

type GameOverProps = {
  youWon: boolean;
  rule: string | null;
  message: string | null;
  tasksExhausted: boolean;
  nextGame: () => void;
  onExit: () => void;
};

export default function GameOver({
  youWon,
  rule,
  message,
  tasksExhausted,
  nextGame,
  onExit,
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

        <p className="gameover-text">Thank you for playing!</p>

        {tasksExhausted ? (
          <p className="gameover-text">
            You have completed all available tasks.
          </p>
        ) : (
          <p className="gameover-text">
            You are welcome to play another round if you'd like.
          </p>
        )}

        <div className="gameover-buttons">
          {!tasksExhausted && (
            <button
              className="btn primary gameover-button"
              onClick={() => {
                actionLog.log("game_over_next_clicked", { youWon, rule });
                nextGame();
              }}
            >
              Next game
            </button>
          )}
          <button
            className="btn gameover-button"
            onClick={() => {
              actionLog.log("game_over_exit_clicked", { youWon, rule });
              onExit();
            }}
          >
            Exit
          </button>
        </div>
      </div>
    </div>
  );
}
