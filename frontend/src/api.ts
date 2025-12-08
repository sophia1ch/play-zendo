import type { WSMessage } from "./types";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function setRule(rule: string) {
  const r = await fetch(`${BASE}/set-rule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rule }),
  });
  return r.json();
}

export async function renderScene(scene: unknown): Promise<string> {
  const r = await fetch(`${BASE}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scene),
  });
  const j = await r.json();
  return j.pngData as string;
}

export async function submitLabeled(imageDataUrl: string, label: "YES" | "NO") {
  const r = await fetch(`${BASE}/play/submit-labeled`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageDataUrl, label }),
  });
  return r.json();
}

export async function evaluateImage(imageBlob: Blob, mode: "quiz" | "tell") {
  const fd = new FormData();
  fd.append("file", imageBlob, "scene.png");
  fd.append("mode", mode); // FastAPI nimmt mode aus JSON, dieser fd-Append wird ignoriert – kept for symmetry
  const r = await fetch(`${BASE}/play/evaluate-image?mode=${mode}`, {
    method: "POST",
    body: fd,
  });
  return r.json();
}

export function wsConnect(onMessage: (msg: WSMessage) => void): WebSocket {
  const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const url = BASE.replace("http", "ws") + "/ws";
  const ws = new WebSocket(url);
  ws.onmessage = (ev) => {
    onMessage(JSON.parse(ev.data) as WSMessage);
  };
  return ws;
}
