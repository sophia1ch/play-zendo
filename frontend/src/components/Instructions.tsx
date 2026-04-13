import { useState } from "react";
import "./Instructions.css";

type Props = {
  onContinue: () => void;
};

const PAGES = [
  {
    title: "Information Sheet and Declaration on Data Protection",
    content: (
      <>
        <div className="instr-section">
          <h3 className="Instr-section-title">Purpose and potential benefit of the experiment</h3>
          <p>
            The purpose of this study is to examine how people learn and reason
            about visual rules. The results have the potential to enhance our
            understanding of human inductive reasoning and concept learning.
          </p>
        </div>

        <div className="instr-section">
          <h3 className="Instr-section-title">Procedure of the experiment</h3>
          <p>
            After a short briefing and a tutorial, you
            will play a game on the computer.
          </p>
        </div>

        <div className="instr-section">
          <h3 className="Instr-section-title" >Duration</h3>
          <p>
            Participation in the experiment is expected to take approximately
            20 minutes. There is no monetary compensation for participation.
          </p>
        </div>

        <div className="instr-section">
          <h3 className="Instr-section-title">Experiences / Risks associated with participation</h3>
          <p>
            Participants in this study will not be exposed to any risk beyond
            the risks of everyday life.
          </p>
        </div>

        <div className="instr-section">
          <h3 className="Instr-section-title">Privacy statement</h3>
          <p>
            No personal data is collected in this study. The following
            information is recorded: your inputs when working on the tasks
            (scenes you build, label guesses, and rule guesses) as well as
            timing information. This data is linked only to an anonymous
            participant ID generated at the start of the session, and cannot
            be traced back to you as a person. The data will only be used for
            the scientific purposes described here.
          </p>
        </div>

        <div className="instr-section">
          <h3 className="Instr-section-title">Storage</h3>
          <p>
            The experimental data are stored on the JATOS server of TU Darmstadt
            and on TU internal computers. The data is stored in a form that does
            not allow any conclusions to be drawn about your person, i.e. the
            data is anonymised. This anonymised data may also be published
            scientifically.
          </p>
        </div>

        <div className="instr-section">
          <h3 className="Instr-section-title">Voluntariness</h3>
          <p>
            Your participation in this study is voluntary. You are free at any
            time to discontinue your participation without any disadvantages
            arising for you. Data from incomplete sessions will not be used in
            the analysis.
          </p>
        </div>

        <div className="instr-section">
          <h3 className="Instr-section-title" >Agreement</h3>
          <p>
            By continuing, you agree to participate in this experiment and agree
            that the data collected as part of the experiment will be evaluated
            for scientific purposes and stored in anonymous form.
          </p>
        </div>

        <div className="instr-section">
          <h3 className="Instr-section-title">Contact</h3>
          <p className="instr-contact">
            If you have any questions or suggestions, please contact:{" "}
            <strong>Sophia Koehler</strong> (sophia.koehler@tu-darmstadt.de)
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