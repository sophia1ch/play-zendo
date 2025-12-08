import type { SceneJSON, Label, WSMessage } from "./types";

export function wsConnect(onMessage: (m: WSMessage) => void) {
  const shim = { close() {} } as unknown as WebSocket;
  setTimeout(
    () =>
      onMessage({
        type: "system",
        text: "Mock verbunden",
        hypothesis: "(unknown)",
        stones: 0,
      }),
    100
  );
  return shim;
}

export async function renderScene(scene: SceneJSON): Promise<string> {
  const size = scene.size || 320;
  const grid = 10;
  const cell = Math.floor(size / grid);
  const cvs = document.createElement("canvas");
  cvs.width = size;
  cvs.height = size;
  const ctx = cvs.getContext("2d")!;
  ctx.fillStyle = "#e6e6e6";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#c8c8c8";
  for (let i = 1; i < grid; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cell);
    ctx.lineTo(size, i * cell);
    ctx.stroke();
  }
  const colorMap: Record<string, string> = {
    red: "#ef6b73",
    blue: "#66a6ff",
    yellow: "#ffd866",
  };
  const sorted = [...scene.pieces].sort(
    (a, b) => a.y - b.y || a.x - b.x || a.z - b.z
  );
  function withRot(cx: number, cy: number, deg: number, draw: () => void) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  }
  for (const p of sorted) {
    const px = p.x * cell,
      py = p.y * cell,
      m = Math.floor(cell * 0.1),
      w = cell - 2 * m,
      h = w;
    ctx.fillStyle = colorMap[p.color] || "#999";
    ctx.strokeStyle = "#0a0d14";
    ctx.lineWidth = 2;
    const cx = px + cell / 2,
      cy = py + cell / 2;
    if (p.shape === "block")
      withRot(cx, cy, p.rot, () => {
        ctx.fillRect(px + m, py + m, w, h);
        ctx.strokeRect(px + m, py + m, w, h);
      });
    else if (p.shape === "pyramid")
      withRot(cx, cy, p.rot, () => {
        ctx.beginPath();
        ctx.moveTo(px + cell / 2, py + m);
        ctx.lineTo(px + cell - m, py + cell - m);
        ctx.lineTo(px + m, py + cell - m);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });
    else
      withRot(cx, cy, p.rot, () => {
        ctx.beginPath();
        ctx.moveTo(px + m, py + m);
        ctx.lineTo(px + cell - m, py + m);
        ctx.lineTo(px + m, py + cell - m);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });
  }
  return cvs.toDataURL("image/png");
}

export async function evaluateImage(_: Blob, __: "quiz" | "tell") {
  return {
    label: Math.random() > 0.5 ? "YES" : "NO",
    hypothesis: "(unknown)",
    stones: 0,
  };
}
export async function submitLabeled(_: string, __: Label) {
  return { ok: true };
}
export async function setRule(_: string) {
  return { ok: true };
}
