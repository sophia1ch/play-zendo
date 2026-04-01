import { useState } from "react";
import "./Instructions.css";

type Props = {
  onContinue: () => void;
};

const PAGES = [
  {
    title: "Informed Consent",
    content: (
      <>
        <p>
          Please read this information carefully before proceeding. By continuing,
          you confirm that you have read and understood this text and agree to
          participate in the study.
        </p>

        <div className="instr-section">
          <h3 className="instr-section-title">Purpose of the study</h3>
          <p>
            This study investigates how people learn visual rules in the game
            Zendo. Your gameplay data will be used for academic research on human
            inductive reasoning and concept learning. The project is conducted by
            the research team at [“Darmstadt, TU Darmstadt”].
          </p>
        </div>

        <div className="instr-section">
          <h3 className="instr-section-title">What participation involves</h3>
          <p>
            You will play several rounds of Zendo, building scenes, guessing
            labels, and formulating hypotheses about the hidden rule. Each
            session takes about 20 minutes.
          </p>
        </div>

        <div className="instr-section">
          <h3 className="instr-section-title">Data collected and use</h3>
          <ul className="instr-list">
            <li>
              The scenes you build, your YES/NO label guesses, and your typed
              rule guesses.
            </li>
            <li>
              Timing information (e.g., how long you take per turn).
            </li>
            <li>
              Non‑identifying technical information (e.g., browser, screen size)
              used only for data quality control.
            </li>
          </ul>
          <p>
            All data is linked only to a <strong>participant ID</strong> and not
            to your name or other personal identifiers. Data will be stored
            securely and used only for scientific analysis, teaching, and
            publication.
          </p>
          <p>
            Results will be reported in <strong>aggregated, anonymised form</strong>;
            your individual data will not be published or shared with third parties.
          </p>
        </div>

        <div className="instr-section">
          <h3 className="instr-section-title">Your rights and withdrawal</h3>
          <ul className="instr-list">
            <li>
              Your participation is <strong>voluntary</strong>. You may stop at
              any time without giving a reason and without any penalty.
            </li>
            <li>
              If you stop part‑way, the data will not be kept.
            </li>
            <li>
              You may ask for clarification or request deletion of your data
              by contacting the research team at sophia.koehler@tu-darmstadt.de.
            </li>
          </ul>
        </div>

        <div className="instr-section">
          <h3 className="instr-section-title">Privacy and data protection</h3>
          <p>
            We comply with relevant data‑protection regulations (e.g., GDPR).
            Data is stored on secure servers for 3 years, after which it will
            be anonymised or deleted. Only authorised researchers will have
            access to the raw data.
          </p>
        </div>

        <div className="instr-section">
          <h3 className="instr-section-title">Contact</h3>
          <p className="instr-contact">
            If you have questions about the study, data handling, or your rights,
            you may contact: Sophia Koehler, TU Darmstadt, sophia.koehler@tu-darmstadt.de.
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
            <strong>stacked</strong> on top of one another, and 
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
            begin forming hypotheses straight away. All examples will be shown in the gallery at the top of the screen for easy comparison.
          </p>
          <strong>You can click on the images to see a larger view and details about the pieces.</strong>
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
              <strong>Predict the label</strong> — before the game master
              reveals the answer, guess whether your scene follows the rule
              (YES or NO). A correct prediction earns you the possibility of guessing the hidden rule.
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
            In case you earned the possibility of guessing the hidden
            rule, you can input your guess. If your guess is correct, you win. If it is wrong, the
            game master provides a counter-example and the game continues.
          </p>
          <p>
            The game ends when you guess the rule correctly or after 30 examples have been shown.
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
  const [consented, setConsented] = useState(false);
  const isFirstPage = page === 0;
  const nextDisabled = isFirstPage && !consented;

  const handleNext = () => {
    if (isLast) {
      onContinue();
    } else {
      setPage((p) => p + 1);
    }
  };

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

        <div className="instr-body">
          {PAGES[page].content}

          {isFirstPage && (
            <label className="instr-consent">
              <input
                type="checkbox"
                checked={consented}
                onChange={(e) => setConsented(e.target.checked)}
              />
              <span>
                I have read and understood the information above and agree to
                participate in this study.
              </span>
            </label>
          )}
        </div>

        <div className="instr-footer">
          {page > 0 && (
            <button className="btn" onClick={() => setPage((p) => p - 1)}>
              Back
            </button>
          )}

          <button
            className="btn primary"
            onClick={handleNext}
            disabled={nextDisabled}
          >
            {isLast ? "I understand — start the study" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}