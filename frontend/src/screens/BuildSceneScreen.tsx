import SceneBuilder from "../builder/SceneBuilder";
import type { SceneJSON } from "../types";

type Props = {
  scene: SceneJSON;
  setScene: (s: SceneJSON) => void;
  onSubmit: (s: SceneJSON) => void;
};
export default function BuildSceneScreen({ scene, setScene, onSubmit }: Props) {
  return (
    <>
      <div className="row" style={{ gap: 12, position: "relative" }}>
        <SceneBuilder scene={scene} setScene={setScene} />
      </div>
      <div className="row" style={{ gap: 12, position: "relative", display: "flex", justifyContent: "center", marginTop: 5}}>
        <button
            className="btn primary"
            style={{ width: "25%" , alignSelf: "center" }}
            onClick={() => onSubmit(scene)}
            disabled={scene.pieces.length === 0}
          >
            Submit
        </button>
      </div>
    </>
  );
}
