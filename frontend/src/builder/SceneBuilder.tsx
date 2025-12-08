import { useEffect, useMemo, useRef, useState } from "react";
import type { SceneJSON, Piece, Shape, ColorName, Orientation } from "../types";
import { spriteFor } from "../sprites";
import "./SceneBuilder.css";

type Props = { scene: SceneJSON; setScene: (s: SceneJSON) => void };

const SHAPES: Shape[] = ["block", "pyramid", "wedge"];
const COLORS: ColorName[] = ["red", "blue", "yellow"];
const COLOR_HEX: Record<ColorName, string> = {
  red: "#e84c59",
  blue: "#4786ff",
  yellow: "#ffd54d",
};

const CYCLE: Record<Shape, Orientation[]> = {
  block: ["upright", "flat", "upside_down"],
  pyramid: ["upright", "flat", "upside_down"],
  wedge: ["upright", "cheesecake", "upside_down", "doorstop"],
};

export default function SceneBuilder({ scene, setScene }: Props) {
  // visual canvas is at least 420x420, even if scene.size is smaller
  const canvasSize = Math.max(scene.size, 420);

  const piecePx = Math.max(56, Math.min(110, Math.round(canvasSize / 7)));
  const floorY = canvasSize - piecePx - 10;
  const OVERLAP = 6;
  const ADJ_STEP = piecePx - OVERLAP;
  const FAR_SEP = piecePx + 24;
  const SNAP_DIST = 56;
  const STACK_X_TOL = 0.45;
  const STACK_OFFSET = Math.round(piecePx * 0.55);

  const [selShape, setSelShape] = useState<Shape>("block");
  const [selColor, setSelColor] = useState<ColorName>("yellow");
  const [activeId, setActiveId] = useState<string | null>(null);

  const [dragId, setDragId] = useState<string | null>(null);
  const dragOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const downPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const sceneRef = useRef<HTMLDivElement | null>(null);
  const WIDTH_FRAC: Record<Shape, Record<Orientation, number>> = {
    block: {
      upright: 0.6,
      flat: 0.82,
      upside_down: 0.6,
      cheesecake: 0,
      doorstop: 0,
    },
    pyramid: {
      upright: 0.6,
      flat: 0.82,
      upside_down: 0.6,
      cheesecake: 0,
      doorstop: 0,
    },
    wedge: {
      upright: 0.6,
      cheesecake: 0.82,
      upside_down: 0.6,
      doorstop: 0.82,
      flat: 0,
    },
  };

  // Helper – sichtbare Pixelmaße des Steins
  function visWidthPx(p: Piece) {
    return Math.round(piecePx * WIDTH_FRAC[p.shape][p.orientation]);
  }

  function recomputeRelations(pieces: Piece[]): Piece[] {
    // 1) Alles zurücksetzen
    const reset: Piece[] = pieces.map(
      (p): Piece => ({
        ...p,
        touchingLeft: null,
        touchingRight: null,
        onTop: null,
        below: null,
        pointing: null,
      })
    );

    // --- Hilfsfunktionen ---
    const ON_FLOOR_TOL = 4; // wie nah an floorY für „auf dem Boden“
    const Y_SIDE_TOL = 4; // für horizontale Nachbarn
    const EDGE_TOL = 4; // Kantenabstand für „touching“

    const isOnFloor = (p: Piece) => Math.abs(p.y - floorY) <= ON_FLOOR_TOL;

    function findNearestInDirection(
      me: Piece,
      dir: "left" | "right"
    ): Piece | undefined {
      let best: Piece | undefined;
      let bestDist = Infinity;

      for (const other of reset) {
        if (other.id === me.id) continue;

        // optional: ungefähr gleiche Höhe
        if (Math.abs(other.y - me.y) > Y_SIDE_TOL * 2) continue;

        const dx = other.x - me.x;

        if (dir === "right") {
          if (dx <= 0) continue;
          if (dx < bestDist) {
            bestDist = dx;
            best = other;
          }
        } else {
          // nach links
          if (dx >= 0) continue;
          const dist = -dx;
          if (dist < bestDist) {
            bestDist = dist;
            best = other;
          }
        }
      }

      return best;
    }

    // --- Vertikale Stacks: onTop / below ---
    const byX = new Map<number, Piece[]>();
    for (const p of reset) {
      const key = Math.round(p.x); // gleiche Spalte
      if (!byX.has(key)) byX.set(key, []);
      byX.get(key)!.push(p);
    }

    const Y_STACK_TOL = 4; // Toleranz um STACK_OFFSET herum

    for (const group of byX.values()) {
      // größere y = weiter unten
      group.sort((a, b) => b.y - a.y); // unten -> oben

      for (let i = 0; i < group.length - 1; i++) {
        const lower = group[i];
        const upper = group[i + 1];
        const dy = Math.abs(lower.y - upper.y);

        if (Math.abs(dy - STACK_OFFSET) <= Y_STACK_TOL) {
          lower.below = upper.id;
          upper.onTop = lower.id;
        }
      }
    }

    // --- Horizontale Nachbarn: touchingLeft / touchingRight ---
    for (let i = 0; i < reset.length; i++) {
      for (let j = i + 1; j < reset.length; j++) {
        const a = reset[i];
        const b = reset[j];

        if (Math.abs(a.y - b.y) > Y_SIDE_TOL) continue;

        const aW = visWidthPx(a);
        const bW = visWidthPx(b);

        const aLeft = a.x;
        const aRight = a.x + aW;
        const bLeft = b.x;
        const bRight = b.x + bW;

        // a rechts an b
        if (Math.abs(aRight - bLeft) <= EDGE_TOL) {
          a.touchingRight = b.id;
          b.touchingLeft = a.id;
        }
        // b rechts an a
        else if (Math.abs(bRight - aLeft) <= EDGE_TOL) {
          b.touchingRight = a.id;
          a.touchingLeft = b.id;
        }
      }
    }

    // --- Pointing ---
    for (const p of reset) {
      if (!isOnFloor(p)) continue;

      // BLOCK: flat -> rechts
      if (p.shape === "block" && p.orientation === "flat") {
        const target = findNearestInDirection(p, "right");
        p.pointing = target ? target.id : null;
        continue;
      }

      // PYRAMID: flat -> links
      if (p.shape === "pyramid" && p.orientation === "flat") {
        const target = findNearestInDirection(p, "left");
        p.pointing = target ? target.id : null;
        continue;
      }

      // WEDGE: cheesecake -> links, doorstop -> rechts
      if (p.shape === "wedge") {
        if (p.orientation === "cheesecake") {
          const target = findNearestInDirection(p, "left");
          p.pointing = target ? target.id : null;
        } else if (p.orientation === "doorstop") {
          const target = findNearestInDirection(p, "right");
          p.pointing = target ? target.id : null;
        }
      }
    }

    return reset;
  }

  const ensureOrientationForShape = (
    shape: Shape,
    o?: Orientation
  ): Orientation => {
    const valid = CYCLE[shape];
    if (!o) return valid[0];
    return (valid.includes(o) ? o : valid[0]) as Orientation;
  };

  function addPiece() {
    const center = Math.round((canvasSize - piecePx) / 2);
    const slots: number[] = [center];
    for (let i = 1; i < 20; i++) {
      const right = center + i * ADJ_STEP;
      const left = center - i * ADJ_STEP;
      if (right <= canvasSize - piecePx) slots.push(right);
      if (left >= 0) slots.push(left);
    }

    const floorPieces = scene.pieces.filter((p) => Math.abs(p.y - floorY) <= 2);
    const taken = new Set(floorPieces.map((p) => Math.round(p.x)));

    const freeX = slots.find((x) => !taken.has(Math.round(x))) ?? center;
    const x = Math.max(0, Math.min(canvasSize - piecePx, freeX));
    const y = floorY;

    const piece: Piece = {
      id: crypto.randomUUID(),
      shape: selShape,
      color: selColor,
      orientation: ensureOrientationForShape(selShape),
      x,
      y,
      z: 0,
      touchingLeft: null,
      touchingRight: null,
      onTop: null,
      below: null,
      pointing: null,
    };
    const newPieces = [...scene.pieces, piece];
    setScene({ ...scene, pieces: recomputeRelations(newPieces) });
    console.log("Scene", scene);
    setActiveId(piece.id);
  }

  function cycleOrientation(id: string) {
    const newPieces = scene.pieces.map((p) => {
      if (p.id !== id) return p;
      const arr = CYCLE[p.shape];
      const idx = arr.indexOf(p.orientation);
      const next = arr[(idx + 1) % arr.length];
      return { ...p, orientation: next };
    });

    setScene({
      ...scene,
      pieces: recomputeRelations(newPieces),
    });
    console.log("Scene", scene);
  }

  // DELETE helpers
  function deleteActive() {
    if (!activeId) return;
    const filtered = scene.pieces.filter((p) => p.id !== activeId);
    setScene({
      ...scene,
      pieces: recomputeRelations(filtered),
    });
    console.log("Scene", scene);
    setActiveId(null);
  }

  function deleteById(id: string) {
    const filtered = scene.pieces.filter((p) => p.id !== id);
    setScene({
      ...scene,
      pieces: recomputeRelations(filtered),
    });
    console.log("Scene", scene);
    if (activeId === id) setActiveId(null);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && activeId) {
        e.preventDefault();
        deleteActive();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, scene]);

  // Drag
  function onPieceMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setActiveId(id);
    setDragId(id);
    const rect = sceneRef.current!.getBoundingClientRect();
    const p = scene.pieces.find((pp) => pp.id === id)!;
    dragOffset.current = {
      dx: e.clientX - (rect.left + p.x),
      dy: e.clientY - (rect.top + p.y),
    };
    downPos.current = { x: e.clientX, y: e.clientY };
  }

  function clamp(val: number, min: number, max: number) {
    return Math.max(min, Math.min(max, val));
  }

  function onSceneMouseMove(e: React.MouseEvent) {
    if (!dragId) return;
    const rect = sceneRef.current!.getBoundingClientRect();
    const nx = clamp(
      Math.round(e.clientX - rect.left - dragOffset.current.dx),
      0,
      canvasSize - piecePx
    );
    const ny = clamp(
      Math.round(e.clientY - rect.top - dragOffset.current.dy),
      0,
      floorY
    );
    setScene({
      ...scene,
      pieces: scene.pieces.map((p) =>
        p.id === dragId ? { ...p, x: nx, y: ny } : p
      ),
    });
  }

  function onSceneMouseUp(e: React.MouseEvent) {
    if (!dragId) return;

    const moved =
      Math.hypot(e.clientX - downPos.current.x, e.clientY - downPos.current.y) >
      4;
    const me = scene.pieces.find((p) => p.id === dragId)!;
    let targetX = Math.max(0, Math.min(scene.size - piecePx, me.x));
    let targetY = me.y;
    let targetZ = me.z;

    if (moved) {
      const others = scene.pieces.filter((p) => p.id !== dragId);

      // Kandidaten im Umkreis
      type Cand = { p: Piece; dist: number };
      const cands: Cand[] = others
        .map((p) => {
          const d = Math.hypot(
            p.x + piecePx / 2 - (me.x + piecePx / 2),
            p.y + piecePx / 2 - (me.y + piecePx / 2)
          );
          return { p, dist: d };
        })
        .filter((c) => c.dist <= SNAP_DIST)
        .sort((a, b) => a.dist - b.dist);

      if (cands.length) {
        // Snap an den nächsten Nachbarn
        const n = cands[0].p;
        const myCX = me.x + piecePx / 2;
        const nCX = n.x + piecePx / 2;
        const xOverlap = Math.abs(myCX - nCX) <= piecePx * STACK_X_TOL;

        if (xOverlap) {
          // Stapeln: exakt gleiche X-Spalte, sichtbarer Offset nach oben
          targetX = n.x;
          // „Basis“ ist die aktuelle Oberkante der Säule: top-most y des Nachbarn - STACK_OFFSET
          // (alle in einer Säule teilen sich dasselbe x; y reduziert sich pro Ebene)
          const stackTopY = Math.min(
            ...others.filter((p) => p.x === n.x).map((p) => p.y)
          );
          targetY = (isFinite(stackTopY) ? stackTopY : n.y) - STACK_OFFSET;
          targetY = Math.max(0, targetY);
          targetZ = n.z + 1;
        } else {
          // Nebeneinander mit leichter Überlappung und gleicher Basishöhe wie Nachbar
          const leftSide = myCX < nCX;
          const wMe = visWidthPx(me);
          const wN = visWidthPx(n);
          targetY = n.y;

          // bündig (mit kleiner optischer Überlappung)
          const overlapX = Math.round(Math.min(wMe, wN) * 0.07); // ~7% Überlappung
          targetX = leftSide ? n.x - wMe + overlapX : n.x + wN - overlapX;

          // clamping
          targetX = Math.max(0, Math.min(scene.size - piecePx, targetX));

          // gleiche Ebene wie Nachbar
          targetZ = n.z;
        }
      } else {
        // Kein Snap-Ziel: Mindestabstand zu allen erzwingen (weit auseinander)
        const pushAway = (ox: number, oy: number) => {
          let nx = targetX,
            ny = targetY;
          const dx = targetX + piecePx / 2 - (ox + piecePx / 2);
          const dy = targetY + piecePx / 2 - (oy + piecePx / 2);
          const len = Math.hypot(dx, dy) || 1;
          const need = FAR_SEP - len;
          if (need > 0) {
            nx += Math.round((dx / len) * need);
            ny += Math.round((dy / len) * need);
          }
          return {
            x: Math.max(0, Math.min(canvasSize - piecePx, nx)),
            y: Math.max(0, Math.min(floorY, ny)),
          };
        };

        for (const o of others) {
          const cxDist = Math.hypot(
            targetX + piecePx / 2 - (o.x + piecePx / 2),
            targetY + piecePx / 2 - (o.y + piecePx / 2)
          );
          if (cxDist < FAR_SEP) {
            const pushed = pushAway(o.x, o.y);
            targetX = pushed.x;
            targetY = pushed.y;
          }
        }

        // wenn relativ frei: auf Boden „einrasten“
        if (Math.abs(targetY - floorY) > 2) targetY = floorY;
        targetZ = 0;
      }
    } else {
      // kurzer Klick → Orientation wechseln
      cycleOrientation(dragId);
      setDragId(null);
      return;
    }

    const newPieces = scene.pieces.map((p) =>
      p.id === dragId ? { ...p, x: targetX, y: targetY, z: targetZ } : p
    );

    setScene({
      ...scene,
      pieces: recomputeRelations(newPieces),
    });
    console.log("Scene", scene);
    setDragId(null);
  }

  const sorted = useMemo(
    () => [...scene.pieces].sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z),
    [scene.pieces]
  );

  function renderPiece(p: Piece) {
    const baseWrap: React.CSSProperties = {
      position: "absolute",
      left: p.x,
      top: p.y,
      width: piecePx,
      height: piecePx,
      zIndex: 10 + p.z + (p.id === activeId ? 100 : 0),
      userSelect: "none",
    };

    const imgStyle: React.CSSProperties = {
      width: "100%",
      height: "100%",
      objectFit: "contain",
      transform: `scale(1.15)`,
      pointerEvents: "none", // wichtig: Bild selbst fängt keine Events
    };

    const src = spriteFor(p);

    return (
      <div
        key={p.id}
        className={`piece-wrap ${p.id === activeId ? "active" : ""}`}
        style={baseWrap}
        onMouseDown={(e) => onPieceMouseDown(e, p.id)}
      >
        {/* visuelles Outline separat, damit das X nicht verschoben wird */}
        {p.id === activeId && <div className="piece-outline" />}

        {src ? (
          <img
            src={src}
            alt={`${p.shape}-${p.color}-${p.orientation}`}
            style={imgStyle}
            draggable={false}
          />
        ) : (
          <div className="piece-fallback" />
        )}

        {/* Mini-X: immer da, aber nur bei Hover/aktiv sichtbar */}
        <button
          className="mini-x"
          title="Delete"
          onMouseDown={(e) => {
            e.stopPropagation(); // kein Drag starten
            e.preventDefault();
          }}
          onClick={(e) => {
            e.stopPropagation(); // kein Cycle
            deleteById(p.id);
          }}
        >
          ×
        </button>
      </div>
    );
  }

  // Preview
  const preview: Piece = {
    id: "preview",
    shape: selShape,
    color: selColor,
    orientation: ensureOrientationForShape(selShape),
    x: 0,
    y: 0,
    z: 0,
    touchingLeft: null,
    touchingRight: null,
    onTop: null,
    below: null,
    pointing: null,
  };
  const previewSrc = spriteFor(preview);

  return (
    <div className="builder panel">
      <div className="section-title">Scene Builder</div>

      <div className="row builder-row" style={{ gap: 12 }}>
        <div className="palette">
          <div className="label">Shape</div>
          <div className="stack">
            {SHAPES.map((s) => (
              <button
                key={s}
                className={`shape ${selShape === s ? "active" : ""}`}
                onClick={() => setSelShape(s)}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="label">Color</div>
          <div className="stack">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`color swatch ${selColor === c ? "active" : ""}`}
                style={{ backgroundColor: COLOR_HEX[c] }}
                aria-label={c}
                title={c}
                onClick={() => setSelColor(c)}
              />
            ))}
          </div>

          <div className="label">Preview</div>
          <div className="preview">
            {previewSrc ? (
              <img src={previewSrc} alt="preview" />
            ) : (
              <div className="placeholder">—</div>
            )}
          </div>

          <button className="btn add" onClick={addPiece}>
            Add
          </button>
        </div>

        <div
          ref={sceneRef}
          className="scene free"
          style={{ width: canvasSize, height: canvasSize }}
          onMouseMove={onSceneMouseMove}
          onMouseUp={onSceneMouseUp}
          onMouseLeave={onSceneMouseUp}
          onClick={() => setActiveId(null)}
        >
          <div
            className="floor"
            style={{ top: floorY + piecePx, width: canvasSize }}
          />
          {sorted.map((p) => renderPiece(p))}
        </div>
        <div className="builder-info">
          <div className="builder-info-title">Stacking & locking</div>
          <p>
            When you drop a piece near another one, it will try to{" "}
            <strong>lock</strong> into a realistic position:
          </p>
          <ul>
            <li>
              <strong>Side-by-side:</strong> pieces snap next to each other with
              a small overlap if they are at the same height.
            </li>
            <li>
              <strong>On top:</strong> if you drop a piece above another in
              almost the same column, it will stack directly on top.
            </li>
            <li>
              <strong>Floor:</strong> pieces resting on the grey stripe are on
              the floor. Click a piece (without dragging) to cycle its
              orientation.
            </li>
          </ul>
          <p className="builder-info-note">
            Please build scenes that could exist in the{" "}
            <strong>real world</strong>: no floating pieces and no upside_down
            pyramids (or other unstable shapes) unless they are obviously
            stabilized by something underneath or around them.
          </p>
        </div>
      </div>
    </div>
  );
}
