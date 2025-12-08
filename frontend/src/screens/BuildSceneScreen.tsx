import SceneBuilder from "../builder/SceneBuilder";
import type { SceneJSON } from "../types";

type Props = {
  scene: SceneJSON;
  setScene: (s: SceneJSON) => void;
  onSubmit: (s: SceneJSON) => void;
};
export default function BuildSceneScreen({ scene, setScene, onSubmit }: Props) {
  return (
    <div
      className="col"
      style={{
        gap: 12,
        alignItems: "center", // center children horizontally
      }}
    >
      <div
        className="panel"
        style={{
          width: "min(960px, 100%)", // optional max width
        }}
      >
        <SceneBuilder scene={scene} setScene={setScene} />
      </div>

      <div
        className="row"
        style={{
          gap: 12,
          width: "min(960px, 100%)", // match builder width
        }}
      >
        <button
          className="btn primary"
          style={{ width: "100%" }}
          onClick={() => onSubmit(scene)}
        >
          Submit
        </button>
      </div>
    </div>
  );
}
