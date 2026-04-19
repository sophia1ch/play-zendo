import React, { type ReactNode, useRef, useState } from "react";
import SceneBuilder, { type SceneBuilderHandle } from "../builder/SceneBuilder";
import type { SceneJSON } from "../types";

type Props = {
  scene: SceneJSON;
  setScene: (s: SceneJSON) => void;
  onSubmit: (s: SceneJSON, imageDataUrl: string) => void;
  /** When true the Submit button is disabled (used during tutorial phases). */
  submitDisabled?: boolean;
  /** Tutorial instruction shown as an overlay below the canvas, over the submit button. */
  tutorialNote?: ReactNode;
  /** When true, the tutorialNote is centered over the canvas instead of at the bottom. */
  tutorialNoteOnCanvas?: boolean;
};

export default function BuildSceneScreen({ scene, setScene, onSubmit, submitDisabled, tutorialNote, tutorialNoteOnCanvas }: Props) {
  const builderRef = useRef<SceneBuilderHandle>(null);
  const [capturing, setCapturing] = useState(false);

  async function handleSubmit() {
    setCapturing(true);
    try {
      const imageDataUrl = (await builderRef.current?.captureScene()) ?? "";
      onSubmit(scene, imageDataUrl);
    } finally {
      setCapturing(false);
    }
  }

  const noteStyle: React.CSSProperties = {
    background: "rgba(108, 92, 231, 0.92)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 500,
    padding: "8px 16px",
    borderRadius: 8,
    boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
    textAlign: "center",
    flexShrink: 0,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, width: "100%", gap: 8 }}>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <SceneBuilder ref={builderRef} scene={scene} setScene={setScene} />
        {tutorialNote && tutorialNoteOnCanvas && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              maxWidth: 360,
              width: "max-content",
              pointerEvents: "none",
              zIndex: 50,
              ...noteStyle,
            }}
          >
            {tutorialNote}
          </div>
        )}
      </div>
      {tutorialNote && !tutorialNoteOnCanvas && (
        <div style={{ ...noteStyle, alignSelf: "center", maxWidth: 480 }}>
          {tutorialNote}
        </div>
      )}
      <div className="row" style={{ justifyContent: "center", flexShrink: 0 }}>
        <button
          className="btn primary"
          data-tutorial-target="scene-submit-btn"
          style={{ width: "25%", alignSelf: "center" }}
          onClick={handleSubmit}
          disabled={scene.pieces.length === 0 || capturing || (submitDisabled ?? false)}
        >
          {capturing ? "Preparing…" : "Submit"}
        </button>
      </div>
    </div>
  );
}
