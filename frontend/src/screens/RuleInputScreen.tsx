import { useState } from "react";
import * as actionLog from "../actionLog";

type RuleInputProps = { onSubmit: (rule: string | null) => void };

export default function RuleInputScreen({ onSubmit }: RuleInputProps) {
  const [text, setText] = useState("");

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) {
      actionLog.log("rule_skipped");
      onSubmit(null);
      return;
    }
    actionLog.log("rule_typed", { text: trimmed });
    onSubmit(trimmed);
  }

  function handleClear() {
    actionLog.log("rule_input_cleared");
    setText("");
  }

  return (
    <div className="col" style={{ gap: 12, height: "100%", overflow: "hidden" }}>
      {/* Info box */}
      <div
        className="card"
        style={{
          background: "#e8f0fe",
          border: "1px solid #a8c7fa",
          padding: "clamp(6px, 1.2vw, 12px)",
          lineHeight: 1.5,
          fontSize: "clamp(11px, 1.1vw, 13px)",
          minHeight: 0,
          overflowY: "auto",
        }}
      >
        <div className="section-title" style={{ marginBottom: 8, color: "red" }}>
          Leave empty if you wish to save your guess for later.
        </div>
        <div className="section-title" style={{ marginBottom: 8 }}>
          How to describe your rule
        </div>
        <p style={{ margin: "0 0 4px" }}>
          Describe the rule as a sentence, e.g.{" "}
          <em>"There are two blocks and one red piece"</em>.
        </p>
        <p style={{ margin: "0 0 4px" }}>
          Use <strong>piece</strong> when the shape does not matter. Otherwise
          use a specific shape name. Be specific with numbers and avoid vague quantifiers like "some" or "many".
        </p>
        <p style={{ margin: "0 0 4px" }}>
          Do not use negation (e.g. "not", "no", "without") or conditionals (e.g. "if", "then"), allowed are rules like: <em>"There are zero red pieces"</em>.
        </p>
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            fontSize: "clamp(11px, 1vw, 13px)",
            marginTop: 2,
          }}
        >
          <div>
            <strong>Colors:</strong> red, blue, yellow
          </div>
          <div>
            <strong>Shapes:</strong> pyramid, wedge, block
          </div>
          <div>
            <strong>Orientations:</strong> vertical, flat, upright, upside down,
            cheesecake, doorstop
          </div>
          <div>
            <strong>Relations:</strong> touching, pointing to, on top of, grounded
          </div>
          <div>
            <strong>Notes:</strong> Vertical includes both upright and upside down. Flat includes cheesecake and doorstop, which are specific orientations for wedges.
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="panel" style={{ padding: 8, flexShrink: 0 }}>
        <div className="section-title">Your rule guess</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. There are at least two red pieces"
          rows={2}
          style={{
            width: "100%",
            padding: 8,
            fontSize: 14,
            borderRadius: 4,
            border: "1px solid var(--border)",
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />

        <div className="row" style={{gap: 12, position: "relative" }}>
          <button
            className="btn primary"
            style={{ flex: 1 }}
            onClick={handleSubmit}
          >
            Submit
          </button>
          <button className="btn" style={{ flex: 1 }} onClick={
              () => {
                handleClear();
                handleSubmit();
              }
            }>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
