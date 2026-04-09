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
            <li>
              You may use the <strong>notes field</strong> during the game to
              write down observations. <strong>Notes are not collected</strong>{" "}
              and remain private to you.
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
        <div className="instr-section">
          <h3 className="instr-section-title">Goal</h3>
          <p>
            Identify a hidden rule in <strong>as few turns as possible</strong>.
            Each turn gives you information: use it to narrow down your
            hypothesis before committing to a rule guess.
          </p>
        </div>
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
            <strong>stacked</strong> on top of one another, and pieces can{" "}
            <strong>point</strong> toward another piece.
          </p>
        </div>

        <div className="instr-section">
          <h3 className="instr-section-title">Start of the Game</h3>
          <p>
            At the start of the game, you get one scene that follows the hidden rule, and one that does not. These are your first clues about the rule.
          </p>
          <h3 className="instr-section-title">Each turn has three steps</h3>
          <ol className="instr-list instr-ordered">
            <li>
              <strong>Build a scene</strong>: place pieces on the canvas and
              arrange them however you like. Design scenes that test your
              current hypothesis.
            </li>
            <li>
              <strong>Guess the label</strong>: After building a scene you should guess whether the scene follows the hidden rule (YES or NO).
              A <em>correct</em> prediction earns you one opportunity to
              guess the hidden rule this turn. The amount of allowed guesses you have, is displayed under "Allowed Guesses" on the left.
            </li>
            <li>
              <strong>Guess the rule (if earned)</strong>: if you predicted
              the label correctly, you may state the rule in plain language. If
              your guess is correct you win. If it is wrong, the game master
              provides a <strong>counter-example</strong> (a new labelled
              scene that disproves your hypothesis) and play continues with
              that scene added to the gallery. You can also save your guess for
              a later turn.
            </li>
          </ol>
        </div>

        <div className="instr-section">
          <h3 className="instr-section-title">Ending the game</h3>
          <p>
            The game ends when you guess the hidden rule correctly, or after{" "}
            <strong>30 labelled scenes</strong> have been shown.
          </p>
        </div>

        <div className="instr-section">
          <h3 className="instr-section-title">Tips</h3>
          <ul className="instr-list">
            <li>
              Compare YES and NO scenes in the gallery — differences between
              them reveal clues about the rule.
            </li>
            <li>
              Build scenes that change <em>one thing at a time</em> to isolate
              which features matter.
            </li>
            <li>
              Your previous rule guesses are listed on screen to help you keep track of what you have already considered.
            </li>
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
            {isLast ? "I understand — start the tutorial" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}