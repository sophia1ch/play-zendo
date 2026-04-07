import { type CSSProperties, useEffect, useRef, useState } from "react";
import "../styles/TutorialTooltip.css";

interface Props {
  message: string;
  targetSelector?: string;
  arrowDir?: "up" | "down" | "left" | "right";
  offset?: number;
}

export default function TutorialTooltip({
  message,
  targetSelector,
  arrowDir = "down",
  offset = 14,
}: Props) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ opacity: 0 });

  useEffect(() => {
    function reposition() {
      const el = tooltipRef.current;
      if (!el) return;

      // Measure the tooltip (it may be off-screen, but offsetWidth still works)
      const tw = el.offsetWidth || 260;
      const th = el.offsetHeight || 90;

      if (!targetSelector) {
        setStyle({ opacity: 1 });
        return;
      }

      const target = document.querySelector(targetSelector);
      if (!target) {
        setStyle({ opacity: 0 });
        return;
      }

      const tr = target.getBoundingClientRect();
      let top = 0;
      let left = 0;

      if (arrowDir === "down") {
        // tooltip above target, arrow points down
        top = tr.top - th - offset;
        left = tr.left + tr.width / 2 - tw / 2;
      } else if (arrowDir === "up") {
        // tooltip below target, arrow points up
        top = tr.bottom + offset;
        left = tr.left + tr.width / 2 - tw / 2;
      } else if (arrowDir === "right") {
        // tooltip left of target, arrow points right
        top = tr.top + tr.height / 2 - th / 2;
        left = tr.left - tw - offset;
      } else {
        // "left": tooltip right of target, arrow points left
        top = tr.top + tr.height / 2 - th / 2;
        left = tr.right + offset;
      }

      const margin = 8;
      left = Math.max(margin, Math.min(window.innerWidth - tw - margin, left));
      top = Math.max(margin, Math.min(window.innerHeight - th - margin, top));

      setStyle({ opacity: 1, top, left });
    }

    // Small delay so the DOM is fully laid out before measuring
    const t = setTimeout(reposition, 80);
    window.addEventListener("resize", reposition);
    // Periodically re-measure in case layout shifts
    const interval = setInterval(reposition, 1000);

    return () => {
      clearTimeout(t);
      clearInterval(interval);
      window.removeEventListener("resize", reposition);
    };
  }, [targetSelector, arrowDir, offset, message]);

  return (
    <div
      ref={tooltipRef}
      className={`tutorial-tooltip arrow-${arrowDir}`}
      style={{ position: "fixed", zIndex: 9999, maxWidth: 300, ...style }}
    >
      {message}
    </div>
  );
}
