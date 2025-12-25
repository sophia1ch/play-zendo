import { useEffect, useRef, useState } from "react";
import "./styles/global.css";
import TopStrip from "./components/TopStrip";
import BuildSceneScreen from "./screens/BuildSceneScreen";
import ReviewScreen from "./screens/ReviewScreen";
import GuessLabelScreen from "./screens/GuessLabelScreen";
import RuleBuilderScreen from "./screens/RuleBuilderScreen";
import type { Label, SceneJSON, WSMessage } from "./types";
import { wsConnect } from "./api";
import StartScreen from "./components/StartScreen";
import GuessingStones from "./components/GuessingStones";
import PreviousGuesses from "./components/PreviousGuesses";
import Loading from "./components/Loading";
import GameOver from "./screens/GameOver";
import type { MultiPlayer, Mode } from "./components/StartScreen";

export default function App() {
  // 0 = Start, 1 = Build, 2 = Review, 3 = GuessLabel, 4 = RuleBuilder, 5 = GameOver
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);

  const [scene, setScene] = useState<SceneJSON>({
    id: crypto.randomUUID(),
    size: 320,
    pieces: [],
  });

  const [image, setImage] = useState<string>("");
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [waitingForServer, setWaitingForServer] = useState(false);

  // Top strip
  const [posImages, setPosImages] = useState<string[]>([]);
  const [negImages, setNegImages] = useState<string[]>([]);

  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [previousRules, setPreviousRules] = useState<string[]>([]);

  // Stones
  const [yourStones, setYourStones] = useState(0);
  const [otherPlayersStones, setOtherPlayersStones] = useState<number | null>(
    null
  );

  // Popup
  const [popupText, setPopupText] = useState<string | null>(null);

  // GuessLabel
  const [currentGuessImage, setCurrentGuessImage] = useState<string | null>(
    null
  );

  // Game over
  const [gameWinner, setGameWinner] = useState<number | null>(null);
  const [gameRule, setGameRule] = useState<string | null>(null);
  const [gameOverMessage, setGameOverMessage] = useState<string | null>(null);
  const [playerIndex, setPlayerIndex] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);

  // "Latest" values for inside queued async handlers
  const stepRef = useRef<0 | 1 | 2 | 3 | 4 | 5>(0);
  const loadingInitialRef = useRef(false);

  // Message queue and processing flag
  const messageQueueRef = useRef<WSMessage[]>([]);
  const isProcessingRef = useRef(false);
  const playerIndexRef = useRef(playerIndex);

  // Keep refs in sync
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    loadingInitialRef.current = loadingInitial;
  }, [loadingInitial]);

  useEffect(() => {
    playerIndexRef.current = playerIndex;
  }, [playerIndex]);

  function showPopup(message: string | null | undefined): Promise<void> {
    const trimmed = message?.trim();
    if (!trimmed) {
      return Promise.resolve();
    }

    setPopupText(trimmed);

    return new Promise((resolve) => {
      setTimeout(() => {
        setPopupText(null);
        resolve();
      }, 3000);
    });
  }

  // --- Async handler for ONE message ---
  async function handleMessage(msg: WSMessage): Promise<void> {
    console.log("[WS handleMessage]", msg);

    switch (msg.type) {
      case "system": {
        console.log("[WS system]", msg.text);
        return;
      }

      case "labeled_example": {
        console.log("[WS labeled_example]", msg.label);
        const url = msg.imageDataUrl || null;
        if (url) {
          if (msg.label === "YES") {
            setPosImages((prev) => [...prev, url]);
          } else {
            setNegImages((prev) => [...prev, url]);
          }
        }

        // Transition out of start screen once first example arrives
        if (stepRef.current === 0 && loadingInitialRef.current) {
          setLoadingInitial(false);
          setStep(1);
        }

        // description about what the other player did → popup, wait 3s
        if (msg.description && playerIndexRef.current === 1) {
          await showPopup(msg.description);
        }
        return;
      }

      case "quiz_result": {
        setYourStones(msg.stones ?? 0);
        if (msg.correct) {
          await showPopup("You guessed the label correctly!");
        } else {
          await showPopup("You guessed the label incorrectly.");
        }
        return;
      }

      case "update_other_player_stones": {
        console.log(
          "[WS update_other_player_stones] Player:",
          msg.playerId,
          msg.stones,
          playerIndexRef.current
        );
        console.log(
          "Current otherPlayersStones:",
          otherPlayersStones,
          playerIndexRef.current
        );
        if (playerIndexRef.current !== msg.playerId) {
          setOtherPlayersStones(msg.stones);
        }
        return;
      }

      case "model_label": {
        console.log("[WS model_label]", msg.label, msg.hypothesis, msg.stones);
        return;
      }

      case "guess": {
        console.log("[WS guess]", msg.guess, msg.correct, msg.stones);
        return;
      }

      case "guess_rule_prompt": {
        setWaitingForServer(false);
        setStep(4);
        return;
      }

      case "rule_incorrect": {
        console.log("[WS rule_incorrect]", msg.rule);
        setPreviousRules((prev) => [...prev, msg.rule]);
        setYourStones((prev) => prev - 1);
        await showPopup(`The rule "${msg.rule}" was incorrect.`);
        return;
      }

      case "human_guess_label_request": {
        const url = msg.imageDataUrl || "";
        setCurrentGuessImage(url);
        setWaitingForServer(false);
        setStep(3);
        return;
      }

      case "human_propose_request": {
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
        const url = msg.imageDataUrl || "";
        setImage(url);
        setWaitingForServer(false);
        setStep(2);
        return;
      }

      case "game_system_message": {
        const text = msg.text ?? "";

        // Detect "Player X guessed the correct rule: some_rule. Game over."
        if (text.includes("Game over.")) {
          setWaitingForServer(false);

          let winner: number | null = null;
          let rule: string | null = null;

          const match = text.match(
            /Player\s+(\d+)\s+guessed the correct rule:\s*(.*)\.\s*Game over\./
          );

          if (match) {
            winner = Number(match[1]);
            rule = match[2] || null;
            setGameWinner(winner);
            setGameRule(rule);
            setGameOverMessage(text);
            setStep(5);
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
          }
          return;
        }
        if (
          playerIndexRef.current == 1 &&
          text.includes("Player 0 guessed an incorrect rule:")
        ) {
          console.log(
            "[WS game_system_message] Detected incorrect rule message"
          );
          const match = text.match(
            /Player 0 guessed an incorrect rule:\s*(.+?)\.\s*A counter example will be provided\./
          );

          if (match) {
            console.log(
              "[WS game_system_message] Extracted incorrect rule:",
              match[1]
            );
            const rule = match[1]; // the captured rule
            setPreviousRules((prev) => [...prev, rule]);
          }
        }

        // Always show system text as popup, even for game over
        await showPopup(text);
        return;
      }

      default:
        return;
    }
  }

  // --- Async queue processor ---
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

  // WebSocket setup: queue every message, then kick the processor
  useEffect(() => {
    const ws = wsConnect((msg: WSMessage) => {
      console.log("[WS RAW]", msg);
      messageQueueRef.current.push(msg);
      void processQueue();
    });

    wsRef.current = ws;
    return () => {
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleStartGame(mode: Mode, player: MultiPlayer) {
    console.log("handleStartGame called:", mode, player);
    if (!wsRef.current) {
      console.log("No wsRef.current yet!");
      return;
    }
    console.log("wsRef.readyState:", wsRef.current.readyState);
    setLoadingInitial(true);
    wsRef.current.send(
      JSON.stringify({ type: "start", player: player, mode: mode })
    );
    if (mode === "multi") {
      setPlayerIndex(1);
      console.log("Set player index to 1 for multiplayer");
    } else {
      setPlayerIndex(0);
    }
    console.log("Start message sent");
    setWaitingForServer(true);
  }

  function handleSceneSubmit(builtScene: SceneJSON) {
    if (!wsRef.current) return;
    setWaitingForServer(true);
    wsRef.current.send(
      JSON.stringify({
        type: "scene_built",
        scene: builtScene,
      })
    );
  }

  function handleReviewRetry() {
    if (!wsRef.current) return;
    setWaitingForServer(true);
    wsRef.current.send(
      JSON.stringify({
        type: "scene_decision",
        action: "retry",
      })
    );
  }

  function handleReviewTell() {
    if (!wsRef.current) return;
    setWaitingForServer(true);
    wsRef.current.send(
      JSON.stringify({
        type: "scene_decision",
        action: "submit",
        mode: "TELL",
      })
    );
  }

  function handleReviewQuiz() {
    if (!wsRef.current) return;
    setWaitingForServer(true);
    wsRef.current.send(
      JSON.stringify({
        type: "scene_decision",
        action: "submit",
        mode: "QUIZ",
      })
    );
  }

  function handleGuessLabel(label: Label) {
    if (!wsRef.current) return;
    setWaitingForServer(true);
    wsRef.current.send(
      JSON.stringify({
        type: "guess_label",
        label,
      })
    );
  }

  function handleRuleSubmit(rule: string | null) {
    if (!wsRef.current) return;
    setWaitingForServer(true);
    wsRef.current.send(
      JSON.stringify({
        type: "guess_rule",
        wantGuess: rule != null,
        rule: rule ?? undefined,
      })
    );
  }

  function handleNextGame() {
    setStep(0);

    setScene({
      id: crypto.randomUUID(),
      size: 320,
      pieces: [],
    });

    setImage("");
    setLoadingInitial(false);
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

    // Clear any queued WS messages
    messageQueueRef.current = [];
  }

  const youWon = gameWinner === playerIndexRef.current;

  // --- render ---

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
            <GuessingStones
              yours={yourStones}
              others={otherPlayersStones ?? undefined}
            />
            <PreviousGuesses rules={previousRules} />
          </div>
        </>
      )}

      {popupText && (
        <div className="popup-overlay">
          <div className="popup-card">{popupText}</div>
        </div>
      )}

      <div className="main-content">
        {step === 0 && (
          <StartScreen loading={loadingInitial} onStart={handleStartGame} />
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
            onQuiz={handleReviewQuiz}
            onTell={handleReviewTell}
            onRetry={handleReviewRetry}
          />
        )}

        {step === 3 && currentGuessImage && (
          <GuessLabelScreen
            image={currentGuessImage}
            onGuess={handleGuessLabel}
          />
        )}

        {step === 4 && <RuleBuilderScreen onSubmit={handleRuleSubmit} />}

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
