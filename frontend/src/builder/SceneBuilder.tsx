import { useEffect, useMemo, useRef, useState } from "react";
import type { SceneJSON, Piece, Shape, ColorName, Orientation } from "../types";
import { spriteFor } from "../sprites";
import * as actionLog from "../actionLog";
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

// Orientations that allow manual pointing via the arrow-drag UI.
function isPointableOrientation(p: Piece): boolean {
  return (
    ((p.shape === "block" || p.shape === "pyramid") && p.orientation === "flat") ||
    (p.shape === "wedge" &&
      (p.orientation === "cheesecake" || p.orientation === "doorstop"))
  );
}

// CSS rotation (degrees) applied to the sprite image when the piece has a
// pointing target set. 0 = no rotation (sprite shown as-is).
const POINTING_SPRITE_ROTATION: Record<string, number> = {
  block_flat: 350,
  pyramid_flat: 30,
  wedge_cheesecake: 30,
  wedge_doorstop: 350, 
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

  // Arrow-drag state: drag from the mini-arrow button to a target piece
  const [arrowDragId, setArrowDragId] = useState<string | null>(null);
  const [arrowDragCursor, setArrowDragCursor] = useState<{
    x: number;
    y: number;
  } | null>(null);
  // Which piece the cursor is currently hovering over during an arrow drag
  const [arrowDragHoverTarget, setArrowDragHoverTarget] = useState<string | null>(null);

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
    // Reset spatial relations but preserve manually-set pointing if the
    // target piece still exists in this scene.
    const reset: Piece[] = pieces.map(
      (p): Piece => ({
        ...p,
        touchingLeft: null,
        touchingRight: null,
        onTop: null,
        below: null,
        pointing: pieces.some((other) => other.id === p.pointing)
          ? p.pointing
          : null,
      })
    );

    // --- Hilfsfunktionen ---
    const ON_FLOOR_TOL = 4;
    const Y_SIDE_TOL = 4;
    const EDGE_TOL = 4;

    // --- Vertikale Stacks: onTop / below ---
    const byX = new Map<number, Piece[]>();
    for (const p of reset) {
      const key = Math.round(p.x);
      if (!byX.has(key)) byX.set(key, []);
      byX.get(key)!.push(p);
    }

    const Y_STACK_TOL = 4;

    for (const group of byX.values()) {
      group.sort((a, b) => b.y - a.y);

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

        if (Math.abs(aRight - bLeft) <= EDGE_TOL) {
          a.touchingRight = b.id;
          b.touchingLeft = a.id;
        } else if (Math.abs(bRight - aLeft) <= EDGE_TOL) {
          b.touchingRight = a.id;
          a.touchingLeft = b.id;
        }
      }
    }

    // Pointing is now set exclusively via the arrow-drag UI and preserved
    // above. No automatic pointing detection.
    void ON_FLOOR_TOL; // suppress unused-var warning

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
    actionLog.log("piece_added", { shape: selShape, color: selColor, orientation: piece.orientation });
    console.log("Scene", scene);
    setActiveId(piece.id);
  }

  function cycleOrientation(id: string) {
    const target = scene.pieces.find((p) => p.id === id);
    const newPieces = scene.pieces.map((p) => {
      if (p.id !== id) return p;
      const arr = CYCLE[p.shape];
      const idx = arr.indexOf(p.orientation);
      const next = arr[(idx + 1) % arr.length];
      // Clear pointing when orientation changes since the piece type changes.
      return { ...p, orientation: next, pointing: null };
    });

    if (target) {
      const arr = CYCLE[target.shape];
      const idx = arr.indexOf(target.orientation);
      const next = arr[(idx + 1) % arr.length];
      actionLog.log("piece_orientation_cycled", { shape: target.shape, color: target.color, from: target.orientation, to: next });
    }

    setScene({
      ...scene,
      pieces: recomputeRelations(newPieces),
    });
    console.log("Scene", scene);
  }

  // DELETE helpers
  function deleteActive() {
    if (!activeId) return;
    const target = scene.pieces.find((p) => p.id === activeId);
    if (target) {
      actionLog.log("piece_deleted", { shape: target.shape, color: target.color, orientation: target.orientation, via: "keyboard" });
    }
    const filtered = scene.pieces.filter((p) => p.id !== activeId);
    setScene({
      ...scene,
      pieces: recomputeRelations(filtered),
    });
    console.log("Scene", scene);
    setActiveId(null);
  }

  function deleteById(id: string) {
    const target = scene.pieces.find((p) => p.id === id);
    if (target) {
      actionLog.log("piece_deleted", { shape: target.shape, color: target.color, orientation: target.orientation, via: "button" });
    }
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

  // Piece drag
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

  // Arrow drag – starts from the mini-arrow button on a pointable piece
  function onArrowMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    e.preventDefault();
    setArrowDragId(id);
    const rect = sceneRef.current!.getBoundingClientRect();
    setArrowDragCursor({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }

  function clamp(val: number, min: number, max: number) {
    return Math.max(min, Math.min(max, val));
  }

  function onSceneMouseMove(e: React.MouseEvent) {
    if (arrowDragId) {
      const rect = sceneRef.current!.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setArrowDragCursor({ x: cx, y: cy });

      // Find the topmost piece (highest z) whose bounding box contains the cursor
      let hover: string | null = null;
      let hoverZ = -Infinity;
      for (const p of scene.pieces) {
        if (p.id === arrowDragId) continue;
        if (cx >= p.x && cx <= p.x + piecePx && cy >= p.y && cy <= p.y + piecePx) {
          if (p.z > hoverZ) {
            hoverZ = p.z;
            hover = p.id;
          }
        }
      }
      setArrowDragHoverTarget(hover);
      return;
    }

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
    // Arrow-drag: lock in the hover target that was tracked during mousemove
    if (arrowDragId) {
      const targetId = arrowDragHoverTarget;
      const newPieces = scene.pieces.map((p) =>
        p.id === arrowDragId ? { ...p, pointing: targetId ?? null } : p
      );
      if (targetId) {
        const src = scene.pieces.find((p) => p.id === arrowDragId);
        if (src) actionLog.log("piece_pointing_set", { from: arrowDragId, to: targetId, shape: src.shape, orientation: src.orientation });
      }
      setScene({ ...scene, pieces: recomputeRelations(newPieces) });
      setArrowDragId(null);
      setArrowDragCursor(null);
      setArrowDragHoverTarget(null);
      return;
    }

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
        const n = cands[0].p;
        const myCX = me.x + piecePx / 2;
        const nCX = n.x + piecePx / 2;
        const xOverlap = Math.abs(myCX - nCX) <= piecePx * STACK_X_TOL;

        if (xOverlap) {
          targetX = n.x;
          const stackTopY = Math.min(
            ...others.filter((p) => p.x === n.x).map((p) => p.y)
          );
          targetY = (isFinite(stackTopY) ? stackTopY : n.y) - STACK_OFFSET;
          targetY = Math.max(0, targetY);
          targetZ = n.z + 1;
        } else {
          const leftSide = myCX < nCX;
          const wMe = visWidthPx(me);
          const wN = visWidthPx(n);
          targetY = n.y;

          const overlapX = Math.round(Math.min(wMe, wN) * 0.07);
          targetX = leftSide ? n.x - wMe + overlapX : n.x + wN - overlapX;
          targetX = Math.max(0, Math.min(scene.size - piecePx, targetX));
          targetZ = n.z;
        }
      } else {
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

        if (Math.abs(targetY - floorY) > 2) targetY = floorY;
        targetZ = 0;
      }
    } else {
      // short click → cycle orientation
      cycleOrientation(dragId);
      setDragId(null);
      return;
    }

    actionLog.log("piece_moved", { shape: me.shape, color: me.color, x: targetX, y: targetY, z: targetZ });

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

    // Apply rotation when pointing is set, OR as a live preview while dragging
    // the arrow over a target.
    const rotKey = `${p.shape}_${p.orientation}`;
    const isArrowSource = arrowDragId === p.id;
    const showRotation =
      p.pointing != null || (isArrowSource && arrowDragHoverTarget != null);
    const spriteRotDeg = showRotation ? (POINTING_SPRITE_ROTATION[rotKey] ?? 0) : 0;

    const imgStyle: React.CSSProperties = {
      width: "100%",
      height: "100%",
      objectFit: "contain",
      transform: `scale(1.15) rotate(${spriteRotDeg}deg)`,
      pointerEvents: "none",
    };

    const src = spriteFor(p);
    const isArrowTarget = arrowDragHoverTarget === p.id;

    return (
      <div
        key={p.id}
        className={`piece-wrap ${p.id === activeId ? "active" : ""}${isArrowTarget ? " arrow-target" : ""}`}
        style={baseWrap}
        onMouseDown={(e) => onPieceMouseDown(e, p.id)}
      >
        {p.id === activeId && <div className="piece-outline" />}
        {isArrowTarget && <div className="arrow-target-outline" />}

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

        {/* Mini-X: always rendered, visible on hover/active */}
        <button
          className="mini-x"
          title="Delete"
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onClick={(e) => {
            e.stopPropagation();
            deleteById(p.id);
          }}
        >
          ×
        </button>

        {/* Mini-arrow: only for flat/cheesecake/doorstop orientations */}
        {isPointableOrientation(p) && (
          <button
            className={`mini-arrow${p.pointing ? " has-pointing" : ""}`}
            title={p.pointing ? "Change pointing target (drag)" : "Set pointing target (drag to a piece)"}
            onMouseDown={(e) => onArrowMouseDown(e, p.id)}
            onClick={(e) => e.stopPropagation()}
          >
            →
          </button>
        )}
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

  // Arrow drag overlay: source piece center → cursor
  const arrowDragSrc = arrowDragId
    ? scene.pieces.find((p) => p.id === arrowDragId)
    : null;

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
                onClick={() => { actionLog.log("shape_selected", { shape: s }); setSelShape(s); }}
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
                onClick={() => { actionLog.log("color_selected", { color: c }); setSelColor(c); }}
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
          style={{
            width: canvasSize,
            height: canvasSize,
            cursor: arrowDragId ? "crosshair" : undefined,
          }}
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

          {/* Arrow drag overlay */}
          {arrowDragSrc && arrowDragCursor && (
            <svg
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                zIndex: 999,
              }}
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="8"
                  markerHeight="6"
                  refX="7"
                  refY="3"
                  orient="auto"
                >
                  <polygon points="0 0, 8 3, 0 6" fill="#6c5ce7" />
                </marker>
              </defs>
              <line
                x1={arrowDragSrc.x + piecePx / 2}
                y1={arrowDragSrc.y + piecePx / 2}
                x2={arrowDragCursor.x}
                y2={arrowDragCursor.y}
                stroke="#6c5ce7"
                strokeWidth={2}
                strokeDasharray="5 3"
                markerEnd="url(#arrowhead)"
              />
            </svg>
          )}
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
            <li>
              <strong>Pointing:</strong> flat blocks/pyramids and
              cheesecake/doorstop wedges show a <strong>→</strong> button on
              hover. Drag it to another piece to set the pointing relation.
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
