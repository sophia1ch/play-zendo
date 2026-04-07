import { useRef, useState } from "react";
import SceneBuilder, { type SceneBuilderHandle } from "../builder/SceneBuilder";
import type { SceneJSON } from "../types";

type Props = {
  scene: SceneJSON;
  setScene: (s: SceneJSON) => void;
  onSubmit: (s: SceneJSON, imageDataUrl: string) => void;
  /** When true the Submit button is disabled (used during tutorial phases). */
  submitDisabled?: boolean;
};

export default function BuildSceneScreen({ scene, setScene, onSubmit, submitDisabled }: Props) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, width: "100%", gap: 8 }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <SceneBuilder ref={builderRef} scene={scene} setScene={setScene} />
      </div>
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
