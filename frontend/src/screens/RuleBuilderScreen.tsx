import { useMemo, useState } from "react";

type QuantityTemplate = {
  template: string;
  prolog: string[];
};

const RULE_SCHEMA = {
  QUANTITY: {
    zero: [
      {
        template: "zero {COLOR|SHAPE} pieces",
        prolog: ["zero"],
      },
      {
        template: "zero {COLOR} {SHAPE} pieces",
        prolog: ["zero"],
      },
    ],
    "at least": [
      {
        template:
          "at least {NUMBER} {COLOR|ORIENTATION|SHAPE} pieces{OPERATION}",
        prolog: ["at_least"],
      },
      {
        template: "at least {NUMBER} {COLOR|ORIENTATION} {SHAPE} pieces",
        prolog: ["at_least"],
      },
      {
        template: "at least {NUMBER} {COLOR} {ORIENTATION} pieces",
        prolog: ["at_least"],
      },
      {
        template:
          "at least {NUMBER} {SHAPE|COLOR|ORIENTATION} pieces {INTERACTION}",
        prolog: ["at_least_interaction"],
      },
    ],
    exactly: [
      {
        template:
          "exactly {NUMBER} {COLOR|ORIENTATION|SHAPE} pieces{OPERATION}",
        prolog: ["exactly"],
      },
      {
        template: "exactly {NUMBER} {COLOR|ORIENTATION} {SHAPE} pieces",
        prolog: ["exactly"],
      },
      {
        template: "exactly {NUMBER} {COLOR} {ORIENTATION} pieces",
        prolog: ["exactly"],
      },
      {
        template:
          "exactly {NUMBER} {SHAPE|COLOR|ORIENTATION} pieces {INTERACTION}",
        prolog: ["exactly_interaction"],
      },
    ],
    "more pieces than": [
      {
        template:
          "more {SHAPE|COLOR|ORIENTATION} pieces than {SHAPE|COLOR|ORIENTATION} pieces",
        prolog: ["more_than"],
      },
    ],
    "same amount of": [
      {
        template:
          "same amount of {SHAPE|COLOR|ORIENTATION} pieces and {SHAPE|COLOR|ORIENTATION} pieces",
        prolog: ["same_amount"],
      },
    ],
    "an odd number of": [
      {
        template: "an odd number of total pieces",
        prolog: ["odd_number_of"],
      },
      {
        template:
          "an odd number of {COLOR|ORIENTATION|SHAPE} pieces{OPERATION}",
        prolog: ["odd_number_of"],
      },
      {
        template: "an odd number of {COLOR|ORIENTATION} {SHAPE} pieces",
        prolog: ["odd_number_of"],
      },
      {
        template: "an odd number of {COLOR} {ORIENTATION} pieces",
        prolog: ["odd_number_of"],
      },
      {
        template:
          "an odd number of {COLOR|ORIENTATION|SHAPE} pieces {INTERACTION}",
        prolog: ["odd_number_of_interaction"],
      },
    ],
    "an even number of": [
      {
        template: "an even number of total pieces",
        prolog: ["even_number_of"],
      },
      {
        template:
          "an even number of {COLOR|ORIENTATION|SHAPE} pieces{OPERATION}",
        prolog: ["even_number_of"],
      },
      {
        template: "an even number of {COLOR|ORIENTATION} {SHAPE} pieces",
        prolog: ["even_number_of"],
      },
      {
        template: "an even number of {COLOR} {ORIENTATION} pieces",
        prolog: ["even_number_of"],
      },
      {
        template:
          "an even number of {COLOR|ORIENTATION|SHAPE} pieces {INTERACTION}",
        prolog: ["even_number_of_interaction"],
      },
    ],
    either: [
      {
        template: "either {NUMBER} or {NUMBER} of total pieces",
        prolog: ["either_or"],
      },
    ],
    "pieces of all three": [
      {
        template: "pieces of all three shapes",
        prolog: ["all_three_shapes"],
      },
      {
        template: "pieces of all three colors",
        prolog: ["all_three_colors"],
      },
    ],
    exclucively: [
      {
        template: "exclusively {COLOR|ORIENTATION|SHAPE} pieces",
        prolog: ["exclusively"],
      },
    ],
  },
  OPERATION: [
    {
      template: " and {QUANTITY}",
      prolog: ["and"],
    },
    {
      template: " or {QUANTITY}",
      prolog: ["or"],
    },
    {
      template: "",
      prolog: [""],
    },
  ],
  INTERACTION: [
    {
      template: "touching a {SHAPE|COLOR|ORIENTATION} piece",
      prolog: ["touching"],
    },
    {
      template: "grounded",
      prolog: ["grounded"],
    },
    {
      template: "ungrounded",
      prolog: ["ungrounded"],
    },
    {
      template: "pointing at a {SHAPE|COLOR|ORIENTATION} piece",
      prolog: ["pointing"],
    },
    {
      template: "on top of another {SHAPE|COLOR|ORIENTATION} piece",
      prolog: ["on_top_of"],
    },
  ],
  ORIENTATION: [
    "vertical",
    "flat",
    "upright",
    "upside_down",
    "cheesecake",
    "doorstop",
  ],
  COLOR: ["blue", "yellow", "red"],
  SHAPE: [
    {
      template: "pyramid",
      orientations: ["vertical", "flat", "upright", "upside-down", "weird"],
    },
    {
      template: "wedge",
      orientations: [
        "vertical",
        "doorstop",
        "upright",
        "cheesecake",
        "upside-down",
        "weird",
      ],
    },
    {
      template: "block",
      orientations: ["vertical", "flat", "upright", "upside-down", "weird"],
    },
  ],
  NUMBER: [1, 2, 3],
};

const QUANTITY_PROLOG_OPTIONS = [
  { prolog: "zero", groupKey: "zero", label: "zero" },
  { prolog: "at_least", groupKey: "at least", label: "at_least" },
  { prolog: "exactly", groupKey: "exactly", label: "exactly" },
  { prolog: "more_than", groupKey: "more pieces than", label: "more_than" },
  { prolog: "same_amount", groupKey: "same amount of", label: "same_amount" },
  {
    prolog: "odd_number_of",
    groupKey: "an odd number of",
    label: "odd_number_of",
  },
  {
    prolog: "even_number_of",
    groupKey: "an even number of",
    label: "even_number_of",
  },
  { prolog: "either_or", groupKey: "either", label: "either_or" },
  {
    prolog: "all_three_shapes",
    groupKey: "pieces of all three",
    label: "all_three_shapes",
  },
  {
    prolog: "all_three_colors",
    groupKey: "pieces of all three",
    label: "all_three_colors",
  },
  { prolog: "exclusively", groupKey: "exclucively", label: "exclusively" },
];

// operations at top level: combine two quantities
const OPERATION_OPTIONS = [
  { prolog: "", label: "no combination" },
  { prolog: "and", label: "and" },
  { prolog: "or", label: "or" },
];

const SHAPE_OPTIONS = RULE_SCHEMA.SHAPE.map((s) => s.template);
const COLOR_OPTIONS = RULE_SCHEMA.COLOR;
const ORIENTATION_OPTIONS = RULE_SCHEMA.ORIENTATION;
const NUMBER_OPTIONS = RULE_SCHEMA.NUMBER;

const ATTR_OPTIONS = [
  ...COLOR_OPTIONS,
  ...ORIENTATION_OPTIONS,
  ...SHAPE_OPTIONS,
];

type QuantityState = {
  prolog: string | null; // "at_least", "exactly", "more_than", ...
  // positional arguments:
  arg1: string; // COLOR | SHAPE | ORIENTATION or ""
  arg2: string; // COLOR | SHAPE | ORIENTATION or ""
  interaction: string; // "touching" | "pointing" | "on_top_of" | "grounded" | "" (→ 3rd arg)
  number: number | "";
  number2: number | "";
};

type QuantityBuilderProps = {
  title: string;
  state: QuantityState;
  onChange: (s: QuantityState) => void;
};

function QuantityBuilder({ title, state, onChange }: QuantityBuilderProps) {
  const selectedQuantityInfo =
    QUANTITY_PROLOG_OPTIONS.find((q) => q.prolog === state.prolog) || null;

  const quantityTemplates = useMemo<QuantityTemplate[]>(() => {
    if (!selectedQuantityInfo) return [];
    const group =
      RULE_SCHEMA.QUANTITY[
        selectedQuantityInfo.groupKey as keyof typeof RULE_SCHEMA.QUANTITY
      ];
    return (group || []) as QuantityTemplate[];
  }, [selectedQuantityInfo]);

  const placeholderUsage = useMemo(() => {
    const usage = {
      NUMBER: false,
      COLOR: false,
      ORIENTATION: false,
      SHAPE: false,
      INTERACTION: false,
    };
    for (const tpl of quantityTemplates) {
      const matches = tpl.template.match(/\{([^}]+)\}/g) || [];
      for (const raw of matches) {
        const inner = raw.slice(1, -1);
        if (inner.includes("NUMBER")) usage.NUMBER = true;
        if (inner.includes("COLOR")) usage.COLOR = true;
        if (inner.includes("ORIENTATION")) usage.ORIENTATION = true;
        if (inner.includes("SHAPE")) usage.SHAPE = true;
        if (inner.includes("INTERACTION")) usage.INTERACTION = true;
      }
    }
    return usage;
  }, [quantityTemplates]);

  const chosenTemplate = useMemo<QuantityTemplate | null>(() => {
    if (!selectedQuantityInfo) return null;
    const base = selectedQuantityInfo.prolog;
    const wantInteraction = !!(
      placeholderUsage.INTERACTION && state.interaction
    );
    const targetProlog = wantInteraction ? `${base}_interaction` : base;

    let candidate: QuantityTemplate | null = null;
    for (const tpl of quantityTemplates) {
      const prologList = tpl.prolog || [];
      if (prologList.includes(targetProlog)) {
        candidate = tpl;
        break;
      }
    }
    if (!candidate && quantityTemplates.length > 0) {
      candidate = quantityTemplates[0];
    }
    return candidate;
  }, [
    selectedQuantityInfo,
    placeholderUsage.INTERACTION,
    state.interaction,
    quantityTemplates,
  ]);

  function update(partial: Partial<QuantityState>) {
    onChange({ ...state, ...partial });
  }

  function preview(): string {
    if (!selectedQuantityInfo || !chosenTemplate) {
      return "Select a functor below.";
    }

    let text = chosenTemplate.template;

    // NUMBER
    text = text.replace(/\{NUMBER\}/g, () =>
      state.number !== "" ? String(state.number) : "N"
    );

    const a1 = state.arg1 || "";
    const a2 = state.arg2 || "";

    const attrPhrase = () => {
      if (a1 && a2) return `${a1} ${a2}`;
      if (a1) return a1;
      if (a2) return a2;
      return "pieces";
    };

    // full attribute phrase
    text = text.replace(/\{COLOR\|ORIENTATION\|SHAPE\}/g, () => attrPhrase());

    // where template expects something like "COLOR or ORIENTATION"
    text = text.replace(/\{COLOR\|ORIENTATION\}/g, () => a1 || "attribute");

    // separate placeholders – we loosely map:
    text = text.replace(/\{COLOR\}/g, () => a1 || "color");
    text = text.replace(/\{ORIENTATION\}/g, () => a1 || "orientation");

    // second attribute slot
    text = text.replace(
      /\{SHAPE\|COLOR\|ORIENTATION\}/g,
      () => a2 || a1 || "piece"
    );
    text = text.replace(/\{SHAPE\}/g, () => a2 || a1 || "shape");

    // remove OPERATION placeholder (we handle op at top level)
    text = text.replace("{OPERATION}", "");

    // INTERACTION
    if (text.includes("{INTERACTION}")) {
      const intEntry =
        state.interaction &&
        RULE_SCHEMA.INTERACTION.find((i) => i.prolog[0] === state.interaction);

      let intText = intEntry ? intEntry.template : "";

      if (intText.includes("{SHAPE|COLOR|ORIENTATION}")) {
        // Use second argument as the "target" phrase
        const targetAttrWord = a2 || a1 || "piece";
        intText = intText.replace("{SHAPE|COLOR|ORIENTATION}", targetAttrWord);
      }

      if (intText && !intText.startsWith(" ")) {
        intText = " " + intText;
      }

      text = text.replace("{INTERACTION}", intText);
    }

    return text.trim();
  }

  const usesAttr =
    placeholderUsage.COLOR ||
    placeholderUsage.ORIENTATION ||
    placeholderUsage.SHAPE;

  return (
    <div
      className="card"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div className="section-title">{title}</div>

      {/* Functor tokens */}
      <div style={{ fontSize: 12, marginBottom: 4 }}>Choose functor:</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {QUANTITY_PROLOG_OPTIONS.map((q) => (
          <button
            key={q.prolog}
            type="button"
            className="btn"
            onClick={() =>
              update({
                prolog: q.prolog,
                // reset details when functor changes
                number: "",
                arg1: "",
                arg2: "",
                interaction: "",
              })
            }
            style={{
              padding: "4px 8px",
              fontSize: 12,
              borderRadius: 999,
              background:
                state.prolog === q.prolog ? "var(--accent)" : undefined,
              color: state.prolog === q.prolog ? "#fff" : undefined,
            }}
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Detail chips – only for placeholders that are actually used */}
      {state.prolog && (
        <>
          <div style={{ fontSize: 12, marginTop: 8 }}>Details:</div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {/* NUMBER */}
            {placeholderUsage.NUMBER && (
              <div className="col" style={{ flex: 1, minWidth: 120 }}>
                <span className="section-title">Number</span>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => update({ number: "" })}
                    style={{
                      padding: "2px 6px",
                      fontSize: 12,
                      background:
                        state.number === "" ? "var(--accent)" : undefined,
                      color: state.number === "" ? "#fff" : undefined,
                    }}
                  >
                    any
                  </button>
                  {NUMBER_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="btn"
                      onClick={() => update({ number: n })}
                      style={{
                        padding: "2px 6px",
                        fontSize: 12,
                        background:
                          state.number === n ? "var(--accent)" : undefined,
                        color: state.number === n ? "#fff" : undefined,
                      }}
                    >
                      {n}
                    </button>
                  ))}
                  {/* second number for either_or */}
                  {state.prolog === "either_or" && (
                    <>
                      <span style={{ alignSelf: "center" }}>or</span>
                      {NUMBER_OPTIONS.map((n) => (
                        <button
                          key={`num2-${n}`}
                          type="button"
                          className="btn"
                          onClick={() => update({ number2: n })}
                          style={{
                            padding: "2px 6px",
                            fontSize: 12,
                            background:
                              state.number2 === n ? "var(--accent)" : undefined,
                            color: state.number2 === n ? "#fff" : undefined,
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ATTRIBUTES – unified arg1 / arg2 */}
            {usesAttr && (
              <>
                <div className="col" style={{ flex: 1, minWidth: 140 }}>
                  <span className="section-title">1st argument</span>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => update({ arg1: "" })}
                      style={{
                        padding: "2px 6px",
                        fontSize: 12,
                        background:
                          state.arg1 === "" ? "var(--accent)" : undefined,
                        color: state.arg1 === "" ? "#fff" : undefined,
                      }}
                    >
                      any
                    </button>
                    {ATTR_OPTIONS.map((val) => (
                      <button
                        key={`arg1-${val}`}
                        type="button"
                        className="btn"
                        onClick={() =>
                          update({
                            arg1: state.arg1 === val ? "" : val,
                          })
                        }
                        style={{
                          padding: "2px 6px",
                          fontSize: 12,
                          background:
                            state.arg1 === val ? "var(--accent)" : undefined,
                          color: state.arg1 === val ? "#fff" : undefined,
                        }}
                      >
                        {val.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="col" style={{ flex: 1, minWidth: 140 }}>
                  <span className="section-title">2nd argument</span>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => update({ arg2: "" })}
                      style={{
                        padding: "2px 6px",
                        fontSize: 12,
                        background:
                          state.arg2 === "" ? "var(--accent)" : undefined,
                        color: state.arg2 === "" ? "#fff" : undefined,
                      }}
                    >
                      none
                    </button>
                    {ATTR_OPTIONS.map((val) => (
                      <button
                        key={`arg2-${val}`}
                        type="button"
                        className="btn"
                        onClick={() =>
                          update({
                            arg2: state.arg2 === val ? "" : val,
                          })
                        }
                        style={{
                          padding: "2px 6px",
                          fontSize: 12,
                          background:
                            state.arg2 === val ? "var(--accent)" : undefined,
                          color: state.arg2 === val ? "#fff" : undefined,
                        }}
                      >
                        {val.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* INTERACTION */}
            {placeholderUsage.INTERACTION && (
              <div className="col" style={{ flex: 1, minWidth: 140 }}>
                <span className="section-title">Interaction</span>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      update({
                        interaction: "",
                      })
                    }
                    style={{
                      padding: "2px 6px",
                      fontSize: 12,
                      background:
                        state.interaction === "" ? "var(--accent)" : undefined,
                      color: state.interaction === "" ? "#fff" : undefined,
                    }}
                  >
                    none
                  </button>
                  {RULE_SCHEMA.INTERACTION.map((i) => (
                    <button
                      key={i.prolog[0]}
                      type="button"
                      className="btn"
                      onClick={() =>
                        update({
                          interaction: i.prolog[0],
                        })
                      }
                      style={{
                        padding: "2px 6px",
                        fontSize: 12,
                        background:
                          state.interaction === i.prolog[0]
                            ? "var(--accent)"
                            : undefined,
                        color:
                          state.interaction === i.prolog[0]
                            ? "#fff"
                            : undefined,
                      }}
                    >
                      {i.prolog[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Preview for this quantity */}
      <div>
        <div className="section-title">Preview</div>
        <div
          className="card"
          style={{
            padding: 6,
            background: "#fff",
            fontStyle: state.prolog ? "normal" : "italic",
          }}
        >
          {preview()}
        </div>
      </div>
    </div>
  );
}

function quantityToProlog(q: QuantityState): string | null {
  if (!q.prolog) return null;

  const hasInteraction = !!q.interaction;
  const functor = hasInteraction ? `${q.prolog}_interaction` : q.prolog;

  const args: string[] = [];

  // 1) 1st argument
  if (q.arg1) {
    args.push(q.arg1);
  }

  // 2) 2nd argument
  if (q.arg2) {
    args.push(q.arg2);
  }

  // 3) interaction (for *_interaction functors)
  if (hasInteraction && q.interaction) {
    args.push(q.interaction);
  }

  // 4) number
  if (q.number !== "") {
    args.push(String(q.number));
  }

  if (q.number2 !== "" && q.prolog === "either_or") {
    args.push(String(q.number2));
  }

  // 5) Structure parameter (always)
  args.push("Structure");

  return `${functor}(${args.join(", ")})`;
}

type RuleBuilderProps = { onSubmit: (rule: string | null) => void };

export default function RuleBuilderScreen({ onSubmit }: RuleBuilderProps) {
  const [left, setLeft] = useState<QuantityState>({
    prolog: null,
    number: "",
    number2: "",
    arg1: "",
    arg2: "",
    interaction: "",
  });

  const [right, setRight] = useState<QuantityState>({
    prolog: null,
    number: "",
    number2: "",
    arg1: "",
    arg2: "",
    interaction: "",
  });

  const [operation, setOperation] = useState<string>(""); // "", "and", "or"

  function globalPreview(): string {
    const leftTerm = quantityToProlog(left);
    const rightTerm = quantityToProlog(right);

    if (!leftTerm) return "Build a first condition on the left.";
    if (!operation || operation === "") return leftTerm;

    if (!rightTerm) {
      return `${operation}([${leftTerm}, <choose second condition>])`;
    }

    return `${operation}([${leftTerm}, ${rightTerm}])`;
  }

  function handleSubmit() {
    const leftTerm = quantityToProlog(left);
    if (!leftTerm) {
      onSubmit(null);
      return;
    }

    if (!operation || operation === "") {
      onSubmit(leftTerm);
      return;
    }

    const rightTerm = quantityToProlog(right);
    if (!rightTerm) {
      // if second condition is incomplete, just submit the first
      onSubmit(leftTerm);
      return;
    }

    onSubmit(`${operation}([${leftTerm}, ${rightTerm}])`);
  }

  function handleClear() {
    setLeft({
      prolog: null,
      number: "",
      number2: "",
      arg1: "",
      arg2: "",
      interaction: "",
    });
    setRight({
      prolog: null,
      number: "",
      number2: "",
      arg1: "",
      arg2: "",
      interaction: "",
    });
    setRight({
      prolog: null,
      number: "",
      number2: "",
      arg1: "",
      arg2: "",
      interaction: "",
    });
    setOperation("");
    onSubmit(null);
  }

  return (
    <div className="row" style={{ gap: 12 }}>
      {/* Left column: first condition */}
      <div className="panel" style={{ flex: 1, padding: 10 }}>
        <QuantityBuilder
          title="First condition"
          state={left}
          onChange={setLeft}
        />
      </div>

      {/* Middle: AND/OR and second condition */}
      <div className="panel" style={{ flex: 1.1, padding: 10 }}>
        <div
          className="card"
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          <div className="section-title">Operation</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {OPERATION_OPTIONS.map((op) => (
              <button
                key={op.prolog || "none"}
                type="button"
                className="btn"
                onClick={() => setOperation(op.prolog)}
                style={{
                  padding: "4px 8px",
                  fontSize: 12,
                  borderRadius: 999,
                  background:
                    operation === op.prolog ? "var(--accent)" : undefined,
                  color: operation === op.prolog ? "#fff" : undefined,
                }}
              >
                {op.label}
              </button>
            ))}
          </div>

          {operation && operation !== "" && (
            <QuantityBuilder
              title="Second condition"
              state={right}
              onChange={setRight}
            />
          )}

          <div>
            <div className="section-title">Combined Prolog</div>
            <div
              className="card"
              style={{
                padding: 6,
                background: "#fff",
                fontFamily: "monospace",
                fontSize: 12,
              }}
            >
              {globalPreview()}
            </div>
          </div>

          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn primary"
              style={{ flex: 1 }}
              onClick={handleSubmit}
            >
              Submit
            </button>
            <button className="btn" style={{ flex: 1 }} onClick={handleClear}>
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
