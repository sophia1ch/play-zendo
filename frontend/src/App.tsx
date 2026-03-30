import { useEffect, useRef, useState } from "react";
import "./styles/global.css";
import TopStrip from "./components/TopStrip";
import BuildSceneScreen from "./screens/BuildSceneScreen";
import ReviewScreen from "./screens/ReviewScreen";
import GuessLabelScreen from "./screens/GuessLabelScreen";
import RuleInputScreen from "./screens/RuleInputScreen";
import type { Label, SceneJSON, WSMessage } from "./types";
import { wsConnect } from "./api";
import StartScreen from "./components/StartScreen";
import Instructions from "./components/Instructions";
import GuessingStones from "./components/GuessingStones";
import PreviousGuesses from "./components/PreviousGuesses";
import Loading from "./components/Loading";
import GameOver from "./screens/GameOver";
import type { MultiPlayer, Mode } from "./components/StartScreen";
import * as actionLog from "./actionLog";

export default function App() {
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  const [isStudyComplete, setIsStudyComplete] = useState(false);
  const [showInstructions, setShowInstructions] = useState(
    () => !localStorage.getItem("zendo_visited")
  );

  const [scene, setScene] = useState<SceneJSON>({
    id: crypto.randomUUID(),
    size: 320,
    pieces: [],
  });

  const [image, setImage] = useState<string>("");
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [waitingForServer, setWaitingForServer] = useState(false);

  const [posImages, setPosImages] = useState<string[]>([]);
  const [negImages, setNegImages] = useState<string[]>([]);

  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [previousRules, setPreviousRules] = useState<string[]>([]);

  const [yourStones, setYourStones] = useState(0);
  const [otherPlayersStones, setOtherPlayersStones] = useState<number | null>(null);

  const [popupText, setPopupText] = useState<string | null>(null);
  const [currentGuessImage, setCurrentGuessImage] = useState<string | null>(null);

  const [gameWinner, setGameWinner] = useState<number | null>(null);
  const [gameRule, setGameRule] = useState<string | null>(null);
  const [gameOverMessage, setGameOverMessage] = useState<string | null>(null);
  const [playerIndex, setPlayerIndex] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const backendSessionIdRef = useRef<string | null>(null);
  const lastStartParamsRef = useRef<{ mode: Mode; player: MultiPlayer; name: string } | null>(null);
  const pendingLabelRef = useRef<Label | null>(null);

  const stepRef = useRef<0 | 1 | 2 | 3 | 4 | 5>(0);
  const loadingInitialRef = useRef(false);
  const playerIndexRef = useRef(playerIndex);

  const messageQueueRef = useRef<WSMessage[]>([]);
  const isProcessingRef = useRef(false);

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
    setImage("");
    setWaitingForServer(false);
    setPosImages([]);
    setNegImages([]);
    setPreviousRules([]);
    setYourStones(0);
    setOtherPlayersStones(null);
    setCurrentGuessImage(null);
    setPopupText(null);
    setLightboxImage(null);
    setGameWinner(null);
    setGameRule(null);
    setGameOverMessage(null);
    pendingLabelRef.current = null;
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
        actionLog.log("study_complete");
        setLoadingInitial(false);
        setWaitingForServer(false);
        setIsStudyComplete(true);
        setStep(0);
        return;
      }

      case "human_guess_label_request": {
        const pending = pendingLabelRef.current;
        if (pending !== null) {
          pendingLabelRef.current = null;
          actionLog.log("auto_guess_label", { label: pending });
          if (sendWS({ type: "guess_label", label: pending })) {
            setWaitingForServer(true);
          }
          return;
        }

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

      case "human_scene_preview": {
        actionLog.log("screen_change", { to: "review" });
        setImage(msg.imageDataUrl || "");
        setWaitingForServer(false);
        setStep(2);
        return;
      }

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
            setGameWinner(winner);
            setGameRule(rule);
            setGameOverMessage(text);
            setStep(5);
            return;
          }

          const match2 = text.match(
            /^Player\s+(\d+)\s+guessed a rule:\s*(.*?),\s*the Gamemaster could not disprove\.\s*Game over\.\s*True Rule:\s*(.*)$/
          );

          if (match2) {
            winner = Number(match2[1]);
            rule = match2[3] || null;
            setGameWinner(winner);
            setGameRule(rule);
            setGameOverMessage(text);
            setStep(5);
            return;
          }
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

  function handleStartGame(mode: Mode, player: MultiPlayer, name: string) {
    if (!canSend()) {
      console.warn("No open WebSocket when starting game");
      return;
    }

    lastStartParamsRef.current = { mode, player, name };

    const id = crypto.randomUUID();
    actionLog.startTask(id);
    actionLog.log("game_started", { mode, player, name });

    resetGameUiState();
    setIsStudyComplete(false);
    setLoadingInitial(true);
    setStep(0);
    setPlayerIndex(mode === "multi" ? 1 : 0);

    sendWS({
      type: "start",
      player,
      mode,
      name,
    });

    setWaitingForServer(true);
  }

  function handleSceneSubmit(builtScene: SceneJSON) {
    actionLog.log("scene_submitted", {
      pieceCount: builtScene.pieces.length,
      pieces: builtScene.pieces.map((p) => ({
        shape: p.shape,
        color: p.color,
        orientation: p.orientation,
      })),
    });

    if (sendWS({ type: "scene_built", scene: builtScene })) {
      setWaitingForServer(true);
    }
  }

  function handleReviewRetry() {
    actionLog.log("review_retry");
    if (sendWS({ type: "scene_decision", action: "retry" })) {
      setWaitingForServer(true);
    }
  }

  function handleReviewFollows() {
    actionLog.log("review_follows_rule");
    pendingLabelRef.current = "YES";
    if (sendWS({ type: "scene_decision", action: "submit", mode: "QUIZ" })) {
      setWaitingForServer(true);
    }
  }

  function handleReviewNotFollows() {
    actionLog.log("review_not_follows_rule");
    pendingLabelRef.current = "NO";
    if (sendWS({ type: "scene_decision", action: "submit", mode: "QUIZ" })) {
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
    actionLog.downloadLog();

    resetGameUiState();

    const params = lastStartParamsRef.current;
    if (params && canSend()) {
      const id = crypto.randomUUID();
      actionLog.startTask(id);

      setIsStudyComplete(false);
      setLoadingInitial(true);
      setStep(0);

      sendWS({
        type: "start",
        player: params.player,
        mode: params.mode,
        name: params.name,
      });

      setWaitingForServer(true);
    } else {
      setLoadingInitial(false);
      setStep(0);
    }
  }

  const youWon = gameWinner === playerIndexRef.current;

  return (
    <div className="container col" style={{ gap: 12 }}>
      {step !== 0 && (
        <>
          <TopStrip
            pos={posImages}
            neg={negImages}
            onImageClick={(url) => setLightboxImage(url)}
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
          </div>
        </>
      )}

      {popupText && (
        <div className="popup-overlay">
          <div className="popup-card">{popupText}</div>
        </div>
      )}

      <div className="main-content">
        {step === 0 && isStudyComplete && (
          <div className="start-screen-wrapper">
            <div className="start-screen-inner start-screen container col">
              <h1 className="text-2xl font-semibold">All done!</h1>
              <p>You have completed all tasks. Thank you for participating!</p>
            </div>
          </div>
        )}

        {step === 0 && !isStudyComplete && !loadingInitial && showInstructions && (
          <Instructions
            onContinue={() => {
              localStorage.setItem("zendo_visited", "true");
              setShowInstructions(false);
            }}
          />
        )}

        {step === 0 && !isStudyComplete && !loadingInitial && !showInstructions && (
          <StartScreen loading={loadingInitial} onStart={handleStartGame} />
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

        {step === 2 && (
          <ReviewScreen
            image={image}
            onFollowsRule={handleReviewFollows}
            onNotFollowsRule={handleReviewNotFollows}
            onRetry={handleReviewRetry}
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
            nextGame={handleNextGame}
          />
        )}

        {waitingForServer && <Loading />}
      </div>

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