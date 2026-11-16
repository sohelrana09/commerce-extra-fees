/**
 * The buyer's choices for optional and required fees.
 *
 * Commerce can't store custom data on the quote out of process, so choices are saved in App
 * Builder Database Storage keyed by the quote's internal ID, which the webhook payload carries.
 * Choices expire after SELECTION_TTL_MS so abandoned carts don't pile up.
 *
 * Selections look like { [ruleCode]: true | "optionCode" | ["optionCode", ...] }.
 */

import { findOneOrNull, SELECTIONS, withDb } from "./db.js";

export const SELECTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_RULES = 50;

function isChoosable(rule) {
  return rule?.type === "optional" || rule?.type === "required";
}

/** True when any active rule lets the buyer choose, so the webhook must read choices. */
export function needsSelections(rules) {
  return (rules ?? []).some(
    (rule) => rule?.enabled !== false && isChoosable(rule),
  );
}

function cleanChoice(rule, value) {
  const options = rule.options ?? [];
  if (options.length === 0) {
    return value === true ? true : undefined;
  }
  const known = new Set(options.map((option) => option.code));
  const picked = [...new Set(Array.isArray(value) ? value : [value])].filter(
    (code) => typeof code === "string" && known.has(code),
  );
  if ((rule.input ?? "checkbox") === "checkbox") {
    return picked;
  }
  return picked[0];
}

/**
 * Keeps only choices the rules allow: known optional/required rules, known option codes, and
 * one option for dropdown and radio fees. Anything else the browser sends is dropped.
 */
export function sanitizeSelections(rules, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const byCode = new Map(
    (rules ?? []).filter(isChoosable).map((rule) => [rule.code, rule]),
  );
  const clean = {};
  for (const [code, value] of Object.entries(input).slice(0, MAX_RULES)) {
    const rule = byCode.get(code);
    const choice = rule ? cleanChoice(rule, value) : undefined;
    if (choice !== undefined) {
      clean[code] = choice;
    }
  }
  return clean;
}

export function getSelections(
  quoteId,
  params,
  { connect, now = Date.now() } = {},
) {
  return withDb(
    params,
    async (client) => {
      const doc = await findOneOrNull(client.collection(SELECTIONS), {
        quoteId: String(quoteId),
      });
      if (!doc || (doc.expiresAt ?? 0) <= now) {
        return {};
      }
      return doc.selections ?? {};
    },
    connect,
  );
}

export function deleteSelections(quoteId, params, { connect } = {}) {
  return withDb(
    params,
    async (client) => {
      const result = await client
        .collection(SELECTIONS)
        .deleteOne({ quoteId: String(quoteId) });
      return (result?.deletedCount ?? 0) > 0;
    },
    connect,
  );
}

export function saveSelections(
  quoteId,
  selections,
  params,
  { connect, now = Date.now() } = {},
) {
  const doc = {
    expiresAt: now + SELECTION_TTL_MS,
    quoteId: String(quoteId),
    selections,
    updatedAt: new Date(now).toISOString(),
  };
  return withDb(
    params,
    async (client) => {
      await client
        .collection(SELECTIONS)
        .replaceOne({ quoteId: doc.quoteId }, doc, { upsert: true });
      return selections;
    },
    connect,
  );
}
