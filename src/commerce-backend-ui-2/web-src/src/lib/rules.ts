import type { Calc, FeeRule } from "./types.ts";

export const RULE_TYPE_LABELS = {
  automatic: "Automatic",
  optional: "Optional (buyer chooses)",
  required: "Required (buyer picks an option)",
} as const;

export const CALC_MODE_LABELS = {
  fixed: "Fixed amount",
  fixed_plus_percent: "Fixed + percent",
  max_of: "Larger of fixed or percent",
  percent: "Percent",
} as const;

export const APPLY_PER_LABELS = {
  item: "Per item (line)",
  order: "Per order",
  unit: "Per unit (quantity)",
} as const;

export const INPUT_LABELS = {
  checkbox: "Checkboxes (several)",
  dropdown: "Dropdown (one)",
  radio: "Radio buttons (one)",
} as const;

export function emptyRule(): FeeRule {
  return {
    calc: { applyPer: "order", fixed: 0, mode: "fixed" },
    code: "",
    customerGroups: [],
    description: "",
    enabled: false,
    label: "",
    sortOrder: 10,
    stores: [],
    type: "automatic",
  };
}

/** Turns a label into a valid rule or option code: "Small order fee" → "small_order_fee". */
export function toCode(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 40);
}

export function money(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(2)
    : "—";
}

export function describeCalc(calc?: Calc): string {
  if (!calc) {
    return "Per option";
  }
  const per =
    calc.applyPer && calc.applyPer !== "order" ? ` per ${calc.applyPer}` : "";
  const fixed = `${money(calc.fixed ?? 0)}${per}`;
  const percent = `${calc.percent ?? 0}%`;
  let text: string;
  switch (calc.mode ?? "fixed") {
    case "percent":
      text = percent;
      break;
    case "fixed_plus_percent":
      text = `${fixed} + ${percent}`;
      break;
    case "max_of":
      text = `max(${fixed}, ${percent})`;
      break;
    default:
      text = fixed;
  }
  const caps = [
    calc.min === undefined ? "" : `min ${money(calc.min)}`,
    calc.max === undefined ? "" : `max ${money(calc.max)}`,
  ].filter(Boolean);
  return caps.length ? `${text} (${caps.join(", ")})` : text;
}

/** Copies a rule without server-only fields, ready for editing. */
export function editableCopy(rule: FeeRule): FeeRule {
  const { updatedAt: _updatedAt, ...rest } = structuredClone(rule);
  return rest;
}

/** Drops empty optional fields so saved rules stay small and readable. */
export function cleanRule(rule: FeeRule): FeeRule {
  const { description, subtotal, options, input, ...rest } = rule;
  const hasSubtotal =
    subtotal !== undefined &&
    (subtotal.min !== undefined || subtotal.max !== undefined);
  const choosable = rule.type === "optional" || rule.type === "required";
  return {
    ...rest,
    ...(description ? { description } : {}),
    ...(hasSubtotal ? { subtotal } : {}),
    ...(options?.length ? { options } : {}),
    ...(choosable && input ? { input } : {}),
  };
}
