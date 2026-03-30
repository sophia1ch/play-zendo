import { useState } from "react";
import "./Instructions.css";

type Props = {
  onContinue: () => void;
};

const PAGES = [
  {
    title: "Welcome & Study Information",
    content: (
      <>
        <p>
          Thank you for taking part in this study. Before you begin, please read
          the following information carefully.
        </p>

        <div className="instr-section">
          <h3 className="instr-section-title">What this study is about</h3>
          <p>
            You will play a concept-learning game called <strong>Zendo</strong>.
            We are studying how people discover hidden rules through examples.
            Your gameplay data will be used in academic research on human
            inductive reasoning.
          </p>
        </div>

        <div className="instr-section">
          <h3 className="instr-section-title">What data is collected</h3>
          <ul className="instr-list">
            <li>The scenes you build during the game</li>
            <li>Your label guesses (does a scene follow the rule or not)</li>
            <li>Your rule guesses (typed descriptions of the hidden rule)</li>
            <li>Timing information (how long each turn takes)</li>
          </ul>
          <p>
            Data is linked to the <strong>participant ID</strong> you enter on
            the next screen — not to your name or any other personal
            information.
          </p>
        </div>

        <div className="instr-section">
          <h3 className="instr-section-title">Your rights</h3>
          <ul className="instr-list">
            <li>Participation is voluntary. You may stop at any time.</li>
            <li>
              Data is stored securely and used only for academic research.
            </li>
            <li>
              Results will be published in aggregated, anonymised form.
            </li>
          </ul>
          <p className="instr-contact">
            If you have questions, please contact the research team before
            starting.
          </p>
        </div>
      </>
    ),
  },
  {
    title: "The Game: Zendo",
    content: (
      <>
        <p>
          Zendo is a concept-learning game. There is a{" "}
          <strong>hidden rule</strong> known only to the game master. Your goal
          is to figure out what the rule is by building scenes and observing how
          they are labelled.
        </p>

        <div className="instr-section">
          <h3 className="instr-section-title">Pieces</h3>
          <p>
            Each scene is made of coloured 3D pieces. Pieces vary along three
            dimensions:
          </p>
          <ul className="instr-list">
            <li>
              <strong>Shape:</strong> block, pyramid, or wedge
            </li>
            <li>
              <strong>Color:</strong> red, blue, or yellow
            </li>
            <li>
              <strong>Orientation:</strong> upright, upside-down, flat,
              cheesecake, or doorstop
            </li>
          </ul>
          <p>
            Pieces can also <strong>touch</strong> each other or be{" "}
            <strong>stacked</strong> on top of one another, and flat or wedge
            pieces can <strong>point</strong> toward another piece.
          </p>
        </div>

        <div className="instr-section">
          <h3 className="instr-section-title">Labels</h3>
          <p>
            Every scene gets a label from the game master:
          </p>
          <ul className="instr-list">
            <li>
              <strong className="instr-yes">YES</strong> — this scene follows
              the hidden rule
            </li>
            <li>
              <strong className="instr-no">NO</strong> — this scene does not
              follow the hidden rule
            </li>
          </ul>
          <p>
            You start with two example scenes (one YES, one NO) so you can
            begin forming hypotheses straight away.
          </p>
        </div>
      </>
    ),
  },
  {
    title: "How to Play",
    content: (
      <>
        <div className="instr-section">
          <h3 className="instr-section-title">Each turn</h3>
          <ol className="instr-list instr-ordered">
            <li>
              <strong>Build a scene</strong> — drag pieces onto the canvas,
              choose their shape, colour, and orientation.
            </li>
            <li>
              <strong>Review your scene</strong> — a 3D render is shown. You
              can retry if it does not look right.
            </li>
            <li>
              <strong>Predict the label</strong> — before the game master
              reveals the answer, guess whether your scene follows the rule
              (YES or NO). A correct prediction earns you a guessing stone.
            </li>
            <li>
              <strong>See the result</strong> — the scene is added to your
              example gallery at the top of the screen.
            </li>
          </ol>
        </div>

        <div className="instr-section">
          <h3 className="instr-section-title">Guessing the rule</h3>
          <p>
            After each turn you will be asked if you want to guess the hidden
            rule. You need at least one <strong>guessing stone</strong> to make
            a guess. If your guess is correct, you win. If it is wrong, the
            game master provides a counter-example and the game continues.
          </p>
          <p>
            The game ends when you guess the rule correctly or after a maximum
            number of examples have been shown.
          </p>
        </div>

        <div className="instr-section">
          <h3 className="instr-section-title">Tips</h3>
          <ul className="instr-list">
            <li>
              Use the example gallery at the top to compare YES and NO scenes.
            </li>
            <li>
              Try to build scenes that test a specific hypothesis — change only
              one thing at a time.
            </li>
            <li>Previous rule guesses are shown on the left side panel.</li>
          </ul>
        </div>
      </>
    ),
  },
];

export default function Instructions({ onContinue }: Props) {
  const [page, setPage] = useState(0);
  const isLast = page === PAGES.length - 1;

  return (
    <div className="instr-wrapper">
      <div className="instr-card">
        <div className="instr-progress">
          {PAGES.map((_, i) => (
            <div
              key={i}
              className={`instr-dot${i === page ? " active" : i < page ? " done" : ""}`}
            />
          ))}
        </div>

        <h2 className="instr-title">{PAGES[page].title}</h2>

        <div className="instr-body">{PAGES[page].content}</div>

        <div className="instr-footer">
          {page > 0 && (
            <button className="btn" onClick={() => setPage((p) => p - 1)}>
              Back
            </button>
          )}
          <button
            className="btn primary"
            onClick={() => (isLast ? onContinue() : setPage((p) => p + 1))}
          >
            {isLast ? "I understand — start the study" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
