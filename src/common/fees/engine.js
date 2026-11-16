/**
 * Extra Fees rule engine.
 *
 * Pure functions: given fee rules, a normalised cart, the buyer's selections for optional fees
 * and an optional catalog lookup, it returns the fees Commerce should add. No I/O happens here,
 * so the webhook action and the storefront options action share exactly the same pricing.
 *
 * Rule shape (see README for the full reference):
 * {
 *   code, label, description, enabled, sortOrder,
 *   type: "automatic" | "required" | "optional",
 *   input: "checkbox" | "dropdown" | "radio",        // how optional/required fees are offered
 *   stores: [storeId], customerGroups: [groupId],     // empty = all
 *   subtotal: { min, max },                           // eligible subtotal range (min inclusive, max exclusive)
 *   conditions: <cart condition tree>,
 *   items: <item condition tree>,                     // which lines count for per-item/per-unit and % fees
 *   calc: {
 *     mode: "fixed" | "percent" | "fixed_plus_percent" | "max_of",
 *     fixed, percent,
 *     applyPer: "order" | "item" | "unit",            // multiplies the fixed part
 *     base: { includeDiscount, includeShipping },     // what the percent is taken of
 *     min, max                                        // caps on the final fee
 *   },
 *   options: [{ code, label, calc, default }]         // choices; each option may override calc
 * }
 */

import { round2, toNumber } from "./cart.js";
import { fieldsUsed, matchesCart, matchesItem } from "./conditions.js";

export const RULE_TYPES = ["automatic", "required", "optional"];
export const CALC_MODES = ["fixed", "percent", "fixed_plus_percent", "max_of"];
export const APPLY_PER = ["order", "item", "unit"];
export const INPUTS = ["checkbox", "dropdown", "radio"];

const CODE_PATTERN = /^[a-z0-9_]{1,40}$/u;

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function oneOf(value, allowed, name) {
  return value && !allowed.includes(value)
    ? [`${name} must be one of ${allowed.join(", ")}`]
    : [];
}

function validateCalc(calc) {
  const errors = [
    ...oneOf(calc.mode, CALC_MODES, "calc.mode"),
    ...oneOf(calc.applyPer, APPLY_PER, "calc.applyPer"),
  ];
  for (const key of ["fixed", "percent", "min", "max"]) {
    if (hasValue(calc[key]) && !(toNumber(calc[key], -1) >= 0)) {
      errors.push(`calc.${key} must be a number >= 0`);
    }
  }
  return errors;
}

function validateOptions(rule) {
  const errors = [];
  const seen = new Set();
  for (const option of rule.options ?? []) {
    if (!CODE_PATTERN.test(option.code ?? "")) {
      errors.push("each option needs a code of a-z, 0-9 or _");
    }
    if (seen.has(option.code)) {
      errors.push(`duplicate option code "${option.code}"`);
    }
    seen.add(option.code);
    if (!(option.calc || rule.calc)) {
      errors.push(
        `option "${option.code}" needs a calc (or a rule-level calc)`,
      );
    }
  }
  return errors;
}

/** Lists what is wrong with a rule (empty when valid). Used when rules are saved and loaded. */
export function validateRule(rule) {
  if (!rule || typeof rule !== "object") {
    return ["Rule must be an object"];
  }
  const errors = [
    ...(CODE_PATTERN.test(rule.code ?? "")
      ? []
      : ["code must be 1-40 chars of a-z, 0-9 or _"]),
    ...(rule.label ? [] : ["label is required"]),
    ...oneOf(rule.type ?? "automatic", RULE_TYPES, "type"),
    ...oneOf(rule.input, INPUTS, "input"),
  ];
  if (!(rule.calc || (rule.options ?? []).length)) {
    errors.push("calc is required when there are no options");
  }
  const calcs = [rule.calc, ...(rule.options ?? []).map((o) => o.calc)];
  for (const calc of calcs.filter(Boolean)) {
    errors.push(...validateCalc(calc));
  }
  errors.push(...validateOptions(rule));
  return errors;
}

/** Whether any rule reads product categories or attributes, so the caller knows to load the catalog. */
export function needsCatalog(rules) {
  return rules.some((rule) =>
    [...fieldsUsed(rule.items), ...fieldsUsed(rule.conditions)].some(
      (field) => field === "category_ids" || field.startsWith("attr."),
    ),
  );
}

function inList(list, value) {
  return (
    !Array.isArray(list) ||
    list.length === 0 ||
    list.map(Number).includes(Number(value))
  );
}

function inSubtotalRange(range, subtotal) {
  if (!range) {
    return true;
  }
  if (hasValue(range.min) && subtotal < toNumber(range.min)) {
    return false;
  }
  if (hasValue(range.max) && subtotal >= toNumber(range.max)) {
    return false;
  }
  return true;
}

/** Is the rule switched on and does this cart qualify for it (ignoring the buyer's choices)? */
export function isEligible(rule, cart, catalog = {}) {
  if (rule.enabled === false) {
    return false;
  }
  if (cart.itemCount === 0) {
    return false;
  }
  if (!inList(rule.stores, cart.storeId)) {
    return false;
  }
  if (!inList(rule.customerGroups, cart.customer.groupId)) {
    return false;
  }
  if (!inSubtotalRange(rule.subtotal, cart.subtotal)) {
    return false;
  }
  if (!matchesCart(rule.conditions, cart)) {
    return false;
  }
  return matchingItems(rule, cart, catalog).length > 0;
}

export function matchingItems(rule, cart, catalog = {}) {
  if (!rule.items) {
    return cart.items;
  }
  return cart.items.filter((item) => matchesItem(rule.items, item, catalog));
}

/** The amount a percent fee is taken of. Restricted to matching lines when the rule filters items. */
export function percentBase(rule, calc, cart, items) {
  const base = calc.base ?? {};
  const filtered = Boolean(rule.items);
  let amount = filtered
    ? items.reduce((sum, item) => sum + item.rowTotal, 0)
    : cart.subtotal;
  if (base.includeDiscount) {
    amount -= filtered
      ? items.reduce((sum, item) => sum + item.discount, 0)
      : cart.discount;
  }
  if (base.includeShipping) {
    amount += cart.shippingAmount;
  }
  return Math.max(0, amount);
}

function multiplier(applyPer, items) {
  switch (applyPer ?? "order") {
    case "item":
      return items.length;
    case "unit":
      return items.reduce((sum, item) => sum + item.qty, 0);
    default:
      return 1;
  }
}

/** Works out one fee amount (base currency, rounded to cents, after min/max caps). */
export function calculateAmount(rule, calc, cart, items) {
  const fixed = toNumber(calc.fixed) * multiplier(calc.applyPer, items);
  const percent =
    (percentBase(rule, calc, cart, items) * toNumber(calc.percent)) / 100;

  let amount;
  switch (calc.mode ?? "fixed") {
    case "percent":
      amount = percent;
      break;
    case "fixed_plus_percent":
      amount = fixed + percent;
      break;
    case "max_of":
      amount = Math.max(fixed, percent);
      break;
    default:
      amount = fixed;
  }

  if (hasValue(calc.min)) {
    amount = Math.max(amount, toNumber(calc.min));
  }
  if (hasValue(calc.max)) {
    amount = Math.min(amount, toNumber(calc.max));
  }
  return round2(amount);
}

/**
 * Which options of a rule apply.
 * - automatic: the rule's own calc, or every option marked default.
 * - required: the buyer's choice, falling back to the default option (or the first one).
 * - optional: only what the buyer chose. Checkbox fees without options take `true`.
 * Selections look like { [ruleCode]: true | "optionCode" | ["optionCode", ...] }.
 */
function selectedOptions(rule, selection) {
  const byCode = new Map(
    (rule.options ?? []).map((option) => [option.code, option]),
  );
  const picked = (Array.isArray(selection) ? selection : [selection])
    .filter((code) => typeof code === "string")
    .map((code) => byCode.get(code))
    .filter(Boolean);
  return isMultiChoice(rule) ? picked : picked.slice(0, 1);
}

function isMultiChoice(rule) {
  return (rule.input ?? "checkbox") === "checkbox";
}

function ruleLevelChoice(rule) {
  return rule.calc ? [{ calc: rule.calc, code: null, label: null }] : [];
}

export function chosenOptions(rule, selection) {
  const type = rule.type ?? "automatic";
  const options = rule.options ?? [];
  const defaults = options.filter((option) => option.default);

  if (options.length === 0) {
    const on = type !== "optional" || selection === true;
    return on ? ruleLevelChoice(rule) : [];
  }
  if (type === "optional") {
    return selectedOptions(rule, selection);
  }
  if (type === "required") {
    const fromSelection = selectedOptions(rule, selection);
    if (fromSelection.length) {
      return fromSelection;
    }
    if (!defaults.length) {
      return options.slice(0, 1);
    }
    return isMultiChoice(rule) ? defaults : defaults.slice(0, 1);
  }
  return defaults.length ? defaults : ruleLevelChoice(rule);
}

function feeCode(rule, option) {
  return option.code ? `${rule.code}__${option.code}` : rule.code;
}

function feeLabel(rule, option) {
  return option.label ? `${rule.label}: ${option.label}` : rule.label;
}

/**
 * Returns the fees for this cart as Commerce expects them: [{ code, label, base_fee }],
 * ordered by sortOrder. Invalid rules are skipped and reported through `onSkip`.
 */
export function calculateFees(
  rules,
  cart,
  { selections = {}, catalog = {}, onSkip } = {},
) {
  const fees = [];
  const sorted = [...(rules ?? [])].sort(
    (a, b) => toNumber(a.sortOrder) - toNumber(b.sortOrder),
  );

  for (const rule of sorted) {
    const errors = validateRule(rule);
    if (errors.length) {
      onSkip?.(rule, errors);
      continue;
    }
    if (!isEligible(rule, cart, catalog)) {
      continue;
    }
    const items = matchingItems(rule, cart, catalog);
    for (const option of chosenOptions(rule, selections[rule.code])) {
      const calc = option.calc ?? rule.calc;
      const amount = calculateAmount(rule, calc, cart, items);
      if (amount > 0) {
        fees.push({
          base_fee: amount,
          code: feeCode(rule, option),
          label: feeLabel(rule, option),
        });
      }
    }
  }
  return fees;
}

/**
 * The fees a buyer can see and pick for a cart, with prices worked out. For the storefront
 * options action (phase 3); lives here so the shown price always equals the charged price.
 */
export function describeOptions(
  rules,
  cart,
  { selections = {}, catalog = {} } = {},
) {
  return [...(rules ?? [])]
    .filter((rule) => (rule.type ?? "automatic") !== "automatic")
    .filter((rule) => validateRule(rule).length === 0)
    .filter((rule) => isEligible(rule, cart, catalog))
    .sort((a, b) => toNumber(a.sortOrder) - toNumber(b.sortOrder))
    .map((rule) => {
      const items = matchingItems(rule, cart, catalog);
      const chosen = new Set(
        chosenOptions(rule, selections[rule.code]).map((o) => o.code),
      );
      const options = (rule.options ?? []).map((option) => ({
        amount: calculateAmount(rule, option.calc ?? rule.calc, cart, items),
        code: option.code,
        default: Boolean(option.default),
        label: option.label,
        selected: chosen.has(option.code),
      }));
      return {
        amount: options.length
          ? null
          : calculateAmount(rule, rule.calc, cart, items),
        code: rule.code,
        description: rule.description ?? "",
        input: rule.input ?? "checkbox",
        label: rule.label,
        options,
        selected: options.length ? chosen.size > 0 : chosen.has(null),
        type: rule.type,
      };
    });
}
