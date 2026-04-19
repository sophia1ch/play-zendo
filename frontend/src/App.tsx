import { useEffect, useRef, useState } from "react";
import "./styles/global.css";
import TopStrip from "./components/TopStrip";
import BuildSceneScreen from "./screens/BuildSceneScreen";
import GuessLabelScreen from "./screens/GuessLabelScreen";
import RuleInputScreen from "./screens/RuleInputScreen";
import type { SceneJSON, WSMessage, Label } from "./types";
import { wsConnect } from "./api";
import Instructions from "./components/Instructions";
import TutorialScreen from "./screens/TutorialScreen";
import GuessingStones from "./components/GuessingStones";
import PreviousGuesses from "./components/PreviousGuesses";
import PlayerNotes from "./components/PlayerNotes";
import Loading from "./components/Loading";
import GameOver from "./screens/GameOver";
import * as actionLog from "./actionLog";

// Set to true to skip the tutorial and go straight to the game after instructions.
const SKIP_TUTORIAL = false;

// Stable participant ID persisted across sessions in localStorage.
// Not written until the user consents (Instructions onContinue) on first visit.
// The real JATOS workerId is also recorded in result metadata at submission time.
const _storedId = localStorage.getItem("zendo_player_id");
const PARTICIPANT_ID: string = _storedId ?? `s_${crypto.randomUUID().slice(0, 8)}`;
const isReturningPlayer = !!_storedId;

// True if the player has already seen and completed the tutorial.
const tutorialAlreadyComplete = !!localStorage.getItem("zendo_tutorial_complete");

export default function App() {
  // High-level app phase: instructions → tutorial → game.
  // Returning players (tutorial already done) jump straight to game.
  const [appPhase, setAppPhase] = useState<"instructions" | "tutorial" | "game">(
    tutorialAlreadyComplete ? "game" : "instructions"
  );

  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  const [isStudyComplete, setIsStudyComplete] = useState(false);
  const [tasksExhausted, setTasksExhausted] = useState(false);
  // const [showInstructions, setShowInstructions] = useState(
  //   () => !localStorage.getItem("zendo_visited")
  // );

  const [scene, setScene] = useState<SceneJSON>({
    id: crypto.randomUUID(),
    size: 320,
    pieces: [],
  });

  const [loadingInitial, setLoadingInitial] = useState(false);
  const [waitingForServer, setWaitingForServer] = useState(false);

  const [posImages, setPosImages] = useState<string[]>([]);
  const [negImages, setNegImages] = useState<string[]>([]);

  const [lightbox, setLightbox] = useState<{
    type: "pos" | "neg";
    index: number;
  } | null>(null);
  const [previousRules, setPreviousRules] = useState<string[]>([]);
  const [playerNotes, setPlayerNotes] = useState("");

  const [yourStones, setYourStones] = useState(0);
  const [otherPlayersStones, setOtherPlayersStones] = useState<number | null>(null);

  const [popupText, setPopupText] = useState<string | null>(null);
  const [currentGuessImage, setCurrentGuessImage] = useState<string | null>(null);

  const [gameWinner, setGameWinner] = useState<number | null>(null);
  const [gameRule, setGameRule] = useState<string | null>(null);
  const [gameOverMessage, setGameOverMessage] = useState<string | null>(null);
  const [playerIndex, setPlayerIndex] = useState<number>(0);
  const [counterExample, setCounterExample] = useState<{
    image: string;
    label: Label;
  } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const backendSessionIdRef = useRef<string | null>(null);

  const stepRef = useRef<0 | 1 | 2 | 3 | 4 | 5>(0);
  const loadingInitialRef = useRef(false);
  const playerIndexRef = useRef(playerIndex);

  const messageQueueRef = useRef<WSMessage[]>([]);
  const isProcessingRef = useRef(false);

  const currentList = lightbox?.type === "pos" ? posImages : negImages;
const currentIndex = lightbox?.index ?? 0;

const currentImage =
  lightbox && currentList ? currentList[currentIndex] : null;

const hasPrev = lightbox ? currentIndex > 0 : false;
const hasNext = lightbox
  ? currentList && currentIndex < currentList.length - 1
  : false;

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    loadingInitialRef.current = loadingInitial;
  }, [loadingInitial]);

  useEffect(() => {
    playerIndexRef.current = playerIndex;
  }, [playerIndex]);

  function canSend(): boolean {
    return !!wsRef.current && wsRef.current.readyState === WebSocket.OPEN;
  }

  function sendWS(payload: unknown): boolean {
    if (!canSend()) {
      console.warn("WebSocket not open, dropping message:", payload);
      return false;
    }
    wsRef.current!.send(JSON.stringify(payload));
    return true;
  }

  function resetGameUiState() {
    setScene({ id: crypto.randomUUID(), size: 320, pieces: [] });
    setWaitingForServer(false);
    setPosImages([]);
    setNegImages([]);
    setPreviousRules([]);
    setYourStones(0);
    setOtherPlayersStones(null);
    setCurrentGuessImage(null);
    setPopupText(null);
    setLightbox(null);
    setGameWinner(null);
    setGameRule(null);
    setGameOverMessage(null);
    messageQueueRef.current = [];
  }

  function showPopup(message: string | null | undefined): Promise<void> {
    const trimmed = message?.trim();
    if (!trimmed) return Promise.resolve();

    setPopupText(trimmed);
    return new Promise((resolve) => {
      setTimeout(() => {
        setPopupText(null);
        resolve();
      }, 5000);
    });
  }

  async function handleMessage(msg: WSMessage): Promise<void> {
    console.log("[WS handleMessage]", msg);

    switch (msg.type) {
      case "ping":
        return;

      case "system": {
        console.log("[WS system]", msg.text);
        if ("sessionId" in msg && msg.sessionId) {
          backendSessionIdRef.current = msg.sessionId;
          console.log("[WS] backend session id:", msg.sessionId);
        }
        return;
      }

      case "labeled_example": {
        actionLog.log("received_labeled_example", { label: msg.label });
        const url = msg.imageDataUrl || null;
        if (url) {
          if (msg.label === "YES") setPosImages((prev) => [...prev, url]);
          else setNegImages((prev) => [...prev, url]);
        }

        if (url && msg.label && msg.isCounterExample) {
          setCounterExample({
            image: url,
            label: msg.label,
          });
        }

        if (stepRef.current === 0 && loadingInitialRef.current) {
          setLoadingInitial(false);
          setStep(1);
        }

        if (msg.description && playerIndexRef.current === 1) {
          await showPopup(msg.description);
        }
        return;
      }

      case "quiz_result": {
        actionLog.log("quiz_result", { correct: msg.correct, stones: msg.stones });
        setYourStones(msg.stones ?? 0);
        await showPopup(
          msg.correct ? "You guessed the label correctly!" : "You guessed the label incorrectly."
        );
        return;
      }

      case "update_other_player_stones": {
        if (playerIndexRef.current !== msg.playerId) {
          setOtherPlayersStones(msg.stones);
        }
        return;
      }

      case "model_label":
      case "guess": {
        return;
      }

      case "guess_rule_prompt": {
        actionLog.log("screen_change", { to: "rule_input" });
        setWaitingForServer(false);
        setStep(4);
        return;
      }

      case "rule_incorrect": {
        actionLog.log("rule_incorrect", { rule: msg.rule });
        setPreviousRules((prev) => [...prev, msg.rule]);
        setYourStones((prev) => prev - 1);
        await showPopup(`The rule "${msg.rule}" was incorrect.`);
        return;
      }

      case "player_finished": {
        actionLog.log("session_complete");
        setLoadingInitial(false);
        setWaitingForServer(false);
        setIsStudyComplete(true);
        setTasksExhausted(msg.exhausted === true);
        // Submit results to JATOS now, in the background.
        actionLog.sendLog(wsRef.current);
        void actionLog.submitToJatos();
        return;
      }

      case "human_guess_label_request": {
        actionLog.log("screen_change", { to: "guess_label" });
        setCurrentGuessImage(msg.imageDataUrl || "");
        setWaitingForServer(false);
        setStep(3);
        return;
      }

      case "human_propose_request": {
        actionLog.log("screen_change", { to: "build_scene" });
        setScene({
          id: crypto.randomUUID(),
          size: 320,
          pieces: [],
        });
        setWaitingForServer(false);
        setStep(1);
        return;
      }

      case "human_scene_preview":
        // No longer shown — backend now goes straight to guess_label.
        return;

      case "game_system_message": {
        const text = msg.text ?? "";

        if (text.includes("Game over.")) {
          actionLog.log("game_over", { message: text });
          setWaitingForServer(false);

          let winner: number | null = null;
          let rule: string | null = null;

          const match1 = text.match(
            /Player\s+(\d+)\s+guessed the correct rule:\s*(.*)\.\s*Game over\./
          );

          if (match1) {
            winner = Number(match1[1]);
            rule = match1[2] || null;
          }

          if (!match1) {
            const match2 = text.match(
              /^Player\s+(\d+)\s+guessed a rule:\s*(.*?),\s*the Gamemaster could not disprove\.\s*Game over\.\s*True Rule:\s*(.*)$/
            );
            if (match2) {
              winner = Number(match2[1]);
              rule = match2[3] || null;
            }
          }

          setGameWinner(winner);
          setGameRule(rule);
          setGameOverMessage(text);
          setStep(5);
          return;
        }

        if (
          playerIndexRef.current === 1 &&
          text.includes("Player 0 guessed an incorrect rule:")
        ) {
          const match = text.match(
            /Player 0 guessed an incorrect rule:\s*(.+?)\.\s*A counter example will be provided\./
          );
          if (match) {
            setPreviousRules((prev) => [...prev, match[1]]);
          }
        }

        await showPopup(text);
        return;
      }

      default:
        return;
    }
  }

  async function processQueue() {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      while (messageQueueRef.current.length > 0) {
        const msg = messageQueueRef.current.shift()!;
        await handleMessage(msg);
      }
    } finally {
      isProcessingRef.current = false;
    }
  }

  useEffect(() => {
    const ws = wsConnect((msg: WSMessage) => {
      console.log("[WS RAW]", msg);
      messageQueueRef.current.push(msg);
      void processQueue();
    });

    wsRef.current = ws;

    // Returning players skip instructions and tutorial — start the game as soon as the
    // WebSocket is open so they land directly in a new task.
    if (tutorialAlreadyComplete) {
      ws.addEventListener("open", () => {
        setTimeout(() => startGame(), 0);
      });
    }

    ws.addEventListener("close", () => {
      console.warn("WebSocket closed");
      setWaitingForServer(false);
    });

    ws.addEventListener("error", (err) => {
      console.error("WebSocket error", err);
      setWaitingForServer(false);
    });

    return () => {
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startGame() {
    if (!canSend()) {
      console.warn("No open WebSocket when starting game");
      return;
    }

    const id = crypto.randomUUID();
    actionLog.startTask(id);
    actionLog.log("game_started", { mode: "single", name: PARTICIPANT_ID });

    resetGameUiState();
    setIsStudyComplete(false);
    setTasksExhausted(false);
    setLoadingInitial(true);
    setStep(0);
    setPlayerIndex(0);

    sendWS({
      type: "start",
      player: "",
      mode: "single",
      name: PARTICIPANT_ID,
    });

    setWaitingForServer(true);
  }

  function handleSceneSubmit(builtScene: SceneJSON, imageDataUrl: string) {
    actionLog.log("scene_submitted", {
      pieceCount: builtScene.pieces.length,
      pieces: builtScene.pieces.map((p) => ({
        shape: p.shape,
        color: p.color,
        orientation: p.orientation,
      })),
    });

    if (sendWS({ type: "scene_built", scene: builtScene, imageDataUrl })) {
      setWaitingForServer(true);
    }
  }

  function handleGuessLabel(label: Label) {
    actionLog.log("guess_label", { label });
    if (sendWS({ type: "guess_label", label })) {
      setWaitingForServer(true);
    }
  }

  function handleRuleSubmit(rule: string | null) {
    actionLog.log("rule_submitted", { rule, skipped: rule == null });
    if (
      sendWS({
        type: "guess_rule",
        wantGuess: rule != null,
        rule: rule ?? undefined,
      })
    ) {
      setWaitingForServer(true);
    }
  }

  function handleNextGame() {
    actionLog.log("next_game_clicked");
    actionLog.sendLog(wsRef.current);
    resetGameUiState();
    startGame();
  }

  function handleExitStudy() {
    actionLog.log("exit_study_clicked");
    actionLog.downloadLog();
    // Results were already submitted in the player_finished handler.
    if (window.jatos) window.jatos.endStudy(true);
    else {
      // Local dev: show the "all done" screen.
      setTasksExhausted(true);
      setStep(0);
    }
  }

  const youWon = gameWinner === playerIndexRef.current;

  // ── Instructions phase ────────────────────────────────────────────────────
  if (appPhase === "instructions") {
    return (
      <div className="container col" style={{ gap: 12, height: "100dvh", overflow: "hidden" }}>
        <div className="main-content">
          <Instructions
            onContinue={() => {
              // Persist the player ID now that the user has consented.
              if (!isReturningPlayer) {
                localStorage.setItem("zendo_player_id", PARTICIPANT_ID);
              }
              localStorage.setItem("zendo_visited", "true");
              actionLog.setMetadata({
                consented: true,
                userAgent: navigator.userAgent,
                screenWidth: window.screen.width,
                screenHeight: window.screen.height,
                jatoWorkerId: window.jatos?.workerId,
              });
              if (SKIP_TUTORIAL) {
                localStorage.setItem("zendo_tutorial_complete", "true");
                setAppPhase("game");
                startGame();
              } else {
                setAppPhase("tutorial");
              }
            }}
          />
        </div>
      </div>
    );
  }

  // ── Tutorial phase ────────────────────────────────────────────────────────
  if (appPhase === "tutorial") {
    return (
      <div className="container col" style={{ gap: 12, height: "100dvh", overflow: "hidden" }}>
        <TutorialScreen
          notes={playerNotes}
          onNotesChange={setPlayerNotes}
          onComplete={() => {
            localStorage.setItem("zendo_tutorial_complete", "true");
            setAppPhase("game");
            startGame();
          }}
        />
      </div>
    );
  }

  // ── Game phase (appPhase === "game") ──────────────────────────────────────
  return (
    <div className="container col" style={{ gap: 12, height: "100dvh", overflow: "hidden" }}>
      {step !== 0 && (
        <>
          <TopStrip
            pos={posImages}
            neg={negImages}
            onImageClick={(type, index) => setLightbox({ type, index })}
          />
          <div className="row">
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <GuessingStones
                yours={yourStones}
                others={otherPlayersStones ?? undefined}
              />
            </div>
            <div style={{ flex: 2, display: "flex", flexDirection: "column" }}>
              <PreviousGuesses rules={previousRules} />
            </div>
            <div style={{ flex: 2, display: "flex", flexDirection: "column" }}>
              <PlayerNotes notes={playerNotes} onChange={setPlayerNotes} />
            </div>
          </div>
        </>
      )}

      {popupText && (
        <div className="popup-overlay">
          <div className="popup-card">{popupText}</div>
        </div>
      )}

      {counterExample && (
        <div className="popup-overlay">
          <div className="popup-card">
            <button
              className="popup-close"
              onClick={() => setCounterExample(null)}
              aria-label="Close"
            >
              ×
            </button>

            <h3>Counterexample</h3>

            <img
              src={counterExample.image}
              alt="counterexample"
              style={{ maxWidth: "100%", borderRadius: 8 }}
            />

            <p style={{ marginTop: 8 }}>
              Label: <strong>{counterExample.label}</strong>
            </p>
          </div>
        </div>
      )}

      <div className="main-content">
        {step === 0 && isStudyComplete && tasksExhausted && (
          <div className="start-screen-wrapper">
            <div className="start-screen-inner start-screen container col">
              <h1 className="text-2xl font-semibold">Thank you!</h1>
              <p>You have completed all available tasks. Thank you for participating!</p>
              <button className="btn primary" onClick={handleExitStudy}>Exit</button>
            </div>
          </div>
        )}

        {step === 0 && !isStudyComplete && loadingInitial && (
          <div className="start-screen-wrapper">
            <div className="start-screen-inner start-screen container col">
              <h1 className="text-2xl font-semibold">Preparing next task...</h1>
              <div className="spinner">Loading initial examples...</div>
            </div>
          </div>
        )}

        {step === 1 && (
          <BuildSceneScreen
            scene={scene}
            setScene={setScene}
            onSubmit={handleSceneSubmit}
          />
        )}

        {step === 3 && currentGuessImage && (
          <GuessLabelScreen
            image={currentGuessImage}
            onGuess={handleGuessLabel}
          />
        )}

        {step === 4 && <RuleInputScreen onSubmit={handleRuleSubmit} />}

        {step === 5 && (
          <GameOver
            youWon={youWon}
            rule={gameRule}
            message={gameOverMessage}
            tasksExhausted={tasksExhausted}
            nextGame={handleNextGame}
            onExit={handleExitStudy}
          />
        )}

        {waitingForServer && <Loading />}
      </div>

      {lightbox && currentImage && (
        <div className="img-lightbox-overlay" onClick={() => setLightbox(null)}>
          <div
            className="img-lightbox-wrapper"
            onClick={(e) => e.stopPropagation()}
          >
            {hasPrev ? (
              <button
                className="img-lightbox-nav"
                onClick={() =>
                  setLightbox((prev) =>
                    prev ? { ...prev, index: prev.index - 1 } : prev
                  )
                }
                aria-label="Previous image"
              >
                ‹
              </button>
            ) : (
              <div className="img-lightbox-nav placeholder" />
            )}

            <div className="img-lightbox-content">
              <button
                className="img-lightbox-close"
                onClick={() => setLightbox(null)}
                aria-label="Close image"
              >
                ×
              </button>
              <img src={currentImage} alt="enlarged example" />
            </div>

            {hasNext ? (
              <button
                className="img-lightbox-nav"
                onClick={() =>
                  setLightbox((prev) =>
                    prev ? { ...prev, index: prev.index + 1 } : prev
                  )
                }
                aria-label="Next image"
              >
                ›
              </button>
            ) : (
              <div className="img-lightbox-nav placeholder" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}