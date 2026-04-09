import { useEffect, useRef, useState } from "react";
import BuildSceneScreen from "./BuildSceneScreen";
import GuessLabelScreen from "./GuessLabelScreen";
import TopStrip from "../components/TopStrip";
import GuessingStones from "../components/GuessingStones";
import PreviousGuesses from "../components/PreviousGuesses";
import PlayerNotes from "../components/PlayerNotes";
import TutorialTooltip from "../components/TutorialTooltip";
import type { SceneJSON } from "../types";
import "../styles/TutorialScreen.css";
import "../styles/TutorialTooltip.css";

// ── Tutorial images (imported so Vite resolves hashed asset URLs) ─────────────
import tutYes1 from "../assets/positive_example.png";
import tutYes2 from "../assets/positive_example_2.png";
import tutNo1 from "../assets/negative_example.png";

const TUTORIAL_YES: string[] = [tutYes1, tutYes2];
const TUTORIAL_NO: string[] = [tutNo1];

// ── Phase types ───────────────────────────────────────────────────────────────
type Phase =
  | "add_pieces"
  | "rotate_flat"
  | "drag_adjacent"
  | "add_and_stack"
  | "point_piece"
  | "submit_scene"
  | "view_examples"
  | "guess_label"
  | "guess_rule"
  | "counterexample_note"
  | "finished";

const PHASES: Phase[] = [
  "add_pieces",
  "rotate_flat",
  "drag_adjacent",
  "add_and_stack",
  "point_piece",
  "submit_scene",
  "view_examples",
  "guess_label",
  "guess_rule",
  "counterexample_note",
  "finished",
];

interface TooltipConfig {
  message: string;
  targetSelector?: string;
  arrowDir?: "up" | "down" | "left" | "right";
}

const TOOLTIPS: Record<Phase, TooltipConfig | null> = {
  add_pieces: {
    message:
      "Add 3 pieces to the scene using the panel on the left. Click + Add or drag the preview directly into the scene.",
    targetSelector: ".sb-add",
    arrowDir: "up",
  },
  rotate_flat: {
    message:
      "Click one of the pieces (without dragging) to cycle its orientation until it becomes flat.",
    targetSelector: ".piece-wrap",
    arrowDir: "down",
  },
  drag_adjacent: {
    message:
      "Drag one of the upright pieces close to the other upright piece — they will snap together when near enough.",
    targetSelector: ".piece-wrap",
    arrowDir: "down",
  },
  add_and_stack: {
    message:
      "Select blue in the color panel, add a new piece, then drag it on top of one of the upright pieces to stack it.",
    targetSelector: ".sb-add",
    arrowDir: "up",
  },
  point_piece: {
    message:
      "Drag the → button of the flat piece to point at another piece.",
    targetSelector: ".piece-wrap",
    arrowDir: "down",
  },
  submit_scene: {
    message: "Great work! Your scene is ready. Click Submit to continue.",
    targetSelector: "[data-tutorial-target=\"scene-submit-btn\"]",
    arrowDir: "up",
  },
  view_examples: {
    message:
      "These are example scenes labelled YES (rule following) or NO. Click any image to see it enlarged!",
    targetSelector: ".topstrips",
    arrowDir: "up",
  },
  guess_label: {
    message:
      "In the tutorial the correct label is shown for you. In the real game you would have to guess — click the highlighted button to continue.",
    targetSelector: ".btn.good",
    arrowDir: "down",
  },
  guess_rule: {
    message:
      "Type your guess for the hidden rule, e.g. \"There is at least one red block\". Then click Submit — or skip.",
    targetSelector: ".tutorial-rule-hint",
    arrowDir: "down",
  },
  counterexample_note: null,
  finished: null,
};

const SCENE_PHASES: Phase[] = [
  "add_pieces",
  "rotate_flat",
  "drag_adjacent",
  "add_and_stack",
  "point_piece",
  "submit_scene",
];

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  onComplete: () => void;
  notes: string;
  onNotesChange: (notes: string) => void;
}

export default function TutorialScreen({ onComplete, notes, onNotesChange }: Props) {
  const [phase, setPhase] = useState<Phase>("add_pieces");
  const [scene, setScene] = useState<SceneJSON>({
    id: crypto.randomUUID(),
    size: 320,
    pieces: [],
  });
  const [capturedSceneImage, setCapturedSceneImage] = useState<string | null>(null);
  const [correctLabel, setCorrectLabel] = useState<"YES" | "NO" | null>(null);
  const [posImages, setPosImages] = useState<string[]>(TUTORIAL_YES);
  const [negImages, setNegImages] = useState<string[]>(TUTORIAL_NO);
  const [allowedGuesses, setAllowedGuesses] = useState(0);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [exampleViewed, setExampleViewed] = useState(false);
  const [ruleText, setRuleText] = useState("");

  // Keep ref in sync so the scene-watching effect has stable access
  const phaseRef = useRef<Phase>("add_pieces");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // ── Auto-advance scene-building phases based on scene changes ──────────────
  useEffect(() => {
    const p = phaseRef.current;

    if (p === "add_pieces") {
      if (scene.pieces.length >= 3) setPhase("rotate_flat");

    } else if (p === "rotate_flat") {
      const hasFlat = scene.pieces.some(
        (piece) =>
          piece.orientation === "flat" ||
          piece.orientation === "cheesecake" ||
          piece.orientation === "doorstop"
      );
      if (hasFlat) setPhase("drag_adjacent");

    } else if (p === "drag_adjacent") {
      const hasAdjacentUprights = scene.pieces.some((piece) => {
        if (piece.orientation !== "upright") return false;
        const leftNeighbor = scene.pieces.find((o) => o.id === piece.touchingLeft);
        const rightNeighbor = scene.pieces.find((o) => o.id === piece.touchingRight);
        return leftNeighbor?.orientation === "upright" || rightNeighbor?.orientation === "upright";
      });
      if (hasAdjacentUprights) setPhase("add_and_stack");

    } else if (p === "add_and_stack") {
      // Blue piece stacked on top of another piece (onTop = the piece it sits on)
      const hasBlueStacked = scene.pieces.some(
        (piece) => piece.color === "blue" && piece.onTop !== null
      );
      if (hasBlueStacked) setPhase("point_piece");

    } else if (p === "point_piece") {
      const hasPointing = scene.pieces.some((piece) => piece.pointing !== null);
      if (hasPointing) setPhase("submit_scene");
    }
  }, [scene]);

  // ── Event handlers ─────────────────────────────────────────────────────────
  function handleSceneSubmit(_scene: SceneJSON, imageDataUrl: string) {
    if (phaseRef.current === "submit_scene") {
      // Tutorial rule: exactly one piece with cheesecake orientation
      const cheesecakeCount = _scene.pieces.filter((p) => p.orientation === "cheesecake").length;
      setCorrectLabel(cheesecakeCount === 1 ? "YES" : "NO");
      setCapturedSceneImage(imageDataUrl);
      setPhase("view_examples");
    }
  }

  function handleImageClick(url: string) {
    setLightboxImage(url);
    setExampleViewed(true);
  }

  function handleGuessLabel(label: "YES" | "NO") {
    if (capturedSceneImage) {
      if (label === "YES") {
        setPosImages((prev) => [...prev, capturedSceneImage]);
      } else {
        setNegImages((prev) => [...prev, capturedSceneImage]);
      }
    }
    setAllowedGuesses(1);
    setPhase("guess_rule");
  }

  function handleRuleSubmit() {
    setPhase("counterexample_note");
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const isScenePhase = SCENE_PHASES.includes(phase);
  const rawTooltipConfig = (phase === "view_examples" && exampleViewed) ? null : TOOLTIPS[phase];
  // For scene phases the message is rendered inline below the canvas; no floating tooltip needed
  const tooltipConfig = isScenePhase ? null : rawTooltipConfig;
  const stepNumber = PHASES.indexOf(phase) + 1;
  const totalSteps = PHASES.length;

  // ── Counter-example note screen ───────────────────────────────────────────
  if (phase === "counterexample_note") {
    return (
      <div className="tutorial-finished-wrapper" data-tutorial-phase="counterexample_note">
        <div className="tutorial-finished-card" style={{ maxWidth: 520 }}>
          <div
            className="tutorial-finished-checkmark"
            style={{ background: "#fefcbf", color: "#744210", fontSize: 28 }}
          >
            ℹ
          </div>
          <h2>What happens after a rule guess?</h2>
          <p>
            In the real game, if your rule guess is <strong>incorrect</strong>,
            the game master provides a <strong>counter-example</strong> — a new
            labelled scene that disproves your hypothesis. This scene is added
            to the gallery so you can use it to refine your thinking before
            guessing again.
          </p>
          <p style={{ fontSize: 13, color: "#4a5568" }}>
            If your guess is <strong>correct</strong>, you win immediately.
            The counter-example only appears when the guess is wrong.
          </p>
          <button
            className="btn primary"
            style={{ fontSize: 16, padding: "10px 36px", marginTop: 8 }}
            onClick={() => setPhase("finished")}
          >
            Continue →
          </button>
        </div>
      </div>
    );
  }

  // ── Finished screen ────────────────────────────────────────────────────────
  if (phase === "finished") {
    return (
      <div className="tutorial-finished-wrapper" data-tutorial-phase="finished">
        <div className="tutorial-finished-card">
          <div className="tutorial-finished-checkmark">✓</div>
          <h2>Tutorial Complete!</h2>
          <p>
            You practised building scenes, viewing labelled examples, guessing
            the label, and formulating a rule hypothesis. You are ready to start
            the real study!
          </p>
          <button
            className="btn primary"
            style={{ fontSize: 16, padding: "10px 36px" }}
            onClick={onComplete}
          >
            Start Study
          </button>
        </div>
      </div>
    );
  }

  // ── Main tutorial layout ───────────────────────────────────────────────────
  return (
    <div
      className="tutorial-screen"
      data-tutorial-phase={phase}
    >
      {/* Banner */}
      <div className="tutorial-banner">
        <span className="tutorial-badge">Tutorial</span>
        <span>Practice round — no data is collected yet</span>
        <span className="tutorial-progress">
          Step {stepNumber} / {totalSteps}
        </span>
      </div>

      {/* Example gallery — always visible (mirroring the real game) */}
      <TopStrip
        pos={posImages}
        neg={negImages}
        onImageClick={handleImageClick}
      />

      {/* Guessing stones + previous guesses row — always visible */}
      <div className="row">
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <GuessingStones
            yours={allowedGuesses}
            note="In the real game this shows how many rule guesses you have earned by predicting labels correctly."
          />
        </div>
        <div style={{ flex: 2, display: "flex", flexDirection: "column" }}>
          <PreviousGuesses
            rules={[]}
            note="Incorrect rule guesses appear here so you can refine your hypothesis over time."
          />
        </div>
        <div style={{ flex: 2, display: "flex", flexDirection: "column" }}>
          <PlayerNotes
            notes={notes}
            onChange={onNotesChange}
            hint="You are allowed to make notes if needed."
          />
        </div>
      </div>

      {/* ── Phase-specific main content ── */}
      <div className="tutorial-main">

        {/* Scene builder phases */}
        {isScenePhase && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
            <div style={{ flex: 1, minHeight: 0 }}>
              <BuildSceneScreen
                scene={scene}
                setScene={setScene}
                onSubmit={handleSceneSubmit}
                submitDisabled={phase !== "submit_scene"}
                tutorialNote={rawTooltipConfig?.message}
                tutorialNoteOnCanvas={phase === "submit_scene"}
              />
            </div>
            {/* Skip only for the tricky pointing step */}
            {phase === "point_piece" && (
              <div className="tutorial-skip-row">
                <button
                  className="tutorial-skip-btn"
                  onClick={() => setPhase("submit_scene")}
                >
                  Skip this step →
                </button>
              </div>
            )}
          </div>
        )}

        {/* View examples */}
        {phase === "view_examples" && (
          <div className="tutorial-view-examples">
            <p>
              The gallery above shows example scenes labelled{" "}
              <strong style={{ color: "green" }}>YES</strong> (rule following)
              and <strong style={{ color: "red" }}>NO</strong> (not rule
              following). Use these to form hypotheses about the hidden rule.
              {!exampleViewed && (
                <>
                  <br />
                  <br />
                  Click any image to enlarge it.
                </>
              )}
            </p>
            {exampleViewed ? (
              <button
                className="btn primary"
                onClick={() => setPhase("guess_label")}
              >
                Continue →
              </button>
            ) : (
              <p style={{ fontSize: 13, color: "#718096" }}>
                (Click an image above to continue)
              </p>
            )}
          </div>
        )}

        {/* Guess label */}
        {phase === "guess_label" && (
          <GuessLabelScreen
            image={capturedSceneImage ?? undefined}
            onGuess={handleGuessLabel}
            correctLabel={correctLabel ?? undefined}
          />
        )}

        {/* Guess rule */}
        {phase === "guess_rule" && (
          <div
            className="col"
            style={{
              gap: 12,
              height: "100%",
              overflow: "hidden",
              padding: "0 8px",
            }}
          >
            {/* Same info box as RuleInputScreen */}
            <div
              className="card"
              style={{
                background: "#e8f0fe",
                border: "1px solid #a8c7fa",
                padding: "clamp(6px, 1.2vw, 12px)",
                lineHeight: 1.5,
                fontSize: "clamp(11px, 1.1vw, 13px)",
                minHeight: 0,
                overflowY: "auto",
              }}
            >
              <div className="section-title" style={{ marginBottom: 8, color: "red" }}>
                Leave empty if you wish to save your guess for later.
              </div>
              <div className="section-title" style={{ marginBottom: 8 }}>
                How to describe your rule
              </div>
              <p style={{ margin: "0 0 4px" }}>
                Describe the rule as a sentence, e.g.{" "}
                <em>"There are two blocks and one red piece"</em>.
              </p>
              <p style={{ margin: "0 0 4px" }}>
                Use <strong>piece</strong> when the shape does not matter. Otherwise
                use a specific shape name. Be specific with numbers and avoid vague
                quantifiers like "some" or "many".
              </p>
              <p style={{ margin: "0 0 4px" }}>
                Do not use negation (e.g. "not", "no", "without") or conditionals
                (e.g. "if", "then"), allowed are rules like:{" "}
                <em>"There are zero red pieces"</em>.
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  fontSize: "clamp(11px, 1vw, 13px)",
                  marginTop: 2,
                }}
              >
                <div><strong>Colors:</strong> red, blue, yellow</div>
                <div><strong>Shapes:</strong> pyramid, wedge, block</div>
                <div>
                  <strong>Orientations:</strong> vertical, flat, upright, upside down,
                  cheesecake, doorstop
                </div>
                <div>
                  <strong>Relations:</strong> touching, pointing to, on top of, grounded
                </div>
                <div>
                  <strong>Notes:</strong> Vertical includes both upright and upside down.
                  Flat includes cheesecake and doorstop, which are specific orientations
                  for wedges.
                </div>
              </div>
            </div>

            <div className="panel" style={{ padding: 8, flexShrink: 0 }}>
              {/* Tutorial-specific note — above the input so the tooltip anchors here */}
              <div className="tutorial-rule-hint" style={{ marginBottom: 8 }}>
                The tutorial has a hidden rule — try to figure it out from the example scenes and the label you just confirmed!
                You can also skip if you are unsure.
              </div>
              <div className="section-title" style={{ marginBottom: 6 }}>
                Your rule guess
              </div>
              <textarea
                value={ruleText}
                onChange={(e) => setRuleText(e.target.value)}
                placeholder="e.g. There are at least two red pieces"
                rows={2}
                style={{
                  width: "100%",
                  padding: 8,
                  fontSize: 14,
                  borderRadius: 4,
                  border: "1px solid var(--border)",
                  resize: "vertical",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
              <div className="row" style={{ gap: 12, marginTop: 8 }}>
                <button
                  className="btn primary"
                  data-tutorial-target="rule-submit-btn"
                  style={{ flex: 1 }}
                  onClick={handleRuleSubmit}
                >
                  Submit
                </button>
                <button
                  className="btn"
                  style={{ flex: 1 }}
                  onClick={handleRuleSubmit}
                >
                  Skip
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tooltip overlay — re-mounts on phase change to trigger entry animation */}
      {tooltipConfig && (
        <TutorialTooltip
          key={phase}
          message={tooltipConfig.message}
          targetSelector={tooltipConfig.targetSelector}
          arrowDir={tooltipConfig.arrowDir}
        />
      )}

      {/* Lightbox */}
      {lightboxImage && (
        <div
          className="img-lightbox-overlay"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="img-lightbox-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="img-lightbox-close"
              onClick={() => setLightboxImage(null)}
              aria-label="Close image"
            >
              ×
            </button>
            <img src={lightboxImage} alt="enlarged example" />
          </div>
        </div>
      )}
    </div>
  );
}
