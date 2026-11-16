/**
 * Condition trees for fee rules, in the spirit of Magento cart price rule conditions.
 *
 * A node is either a group or a leaf:
 *   { all: [node, ...] }      every child must match (an empty list matches)
 *   { any: [node, ...] }      at least one child must match (an empty list does not match)
 *   { not: node }             negation
 *   { field, op, value }      a comparison
 *
 * Cart fields:  subtotal, qty, item_count, weight, shipping_method, country, region, postcode,
 *               city, customer_group, customer_is_guest, store_id
 * Item fields:  sku, qty, price, row_total, weight, category_ids, attr.<code>
 *               (used inside `items` filters; category and attribute values come from the catalog lookup)
 *
 * Operators: eq, neq, gt, gte, lt, lte, in, nin, contains, starts_with, between
 */

const NUMBER_OPS = new Set(["gt", "gte", "lt", "lte", "between"]);

function asList(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null || value === "") {
    return [];
  }
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function sameValue(a, b) {
  if (typeof a === "number" || typeof b === "number") {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) {
      return na === nb;
    }
  }
  return String(a).toLowerCase() === String(b).toLowerCase();
}

export function compare(actual, op, expected) {
  if (NUMBER_OPS.has(op)) {
    const n = Number(actual);
    if (!Number.isFinite(n)) {
      return false;
    }
    switch (op) {
      case "gt":
        return n > Number(expected);
      case "gte":
        return n >= Number(expected);
      case "lt":
        return n < Number(expected);
      case "lte":
        return n <= Number(expected);
      default: {
        const [min, max] = asList(expected).map(Number);
        return n >= min && n <= max;
      }
    }
  }

  // Multi-valued actuals (e.g. category_ids) match when any of their values match.
  if (Array.isArray(actual)) {
    if (op === "nin" || op === "neq") {
      return actual.every((value) => compare(value, op, expected));
    }
    return actual.some((value) => compare(value, op, expected));
  }

  switch (op) {
    case "eq":
      return sameValue(actual, expected);
    case "neq":
      return !sameValue(actual, expected);
    case "in":
      return asList(expected).some((value) => sameValue(actual, value));
    case "nin":
      return !asList(expected).some((value) => sameValue(actual, value));
    case "contains":
      return String(actual)
        .toLowerCase()
        .includes(String(expected).toLowerCase());
    case "starts_with":
      // Postcode prefixes: "SW1,EC" matches SW1A 1AA and EC2V 7HH.
      return asList(expected).some((prefix) =>
        String(actual)
          .toUpperCase()
          .replace(/\s+/gu, "")
          .startsWith(String(prefix).toUpperCase().replace(/\s+/gu, "")),
      );
    default:
      throw new Error(`Unknown operator "${op}"`);
  }
}

export function cartField(cart, field) {
  switch (field) {
    case "subtotal":
      return cart.subtotal;
    case "qty":
      return cart.qty;
    case "item_count":
      return cart.itemCount;
    case "weight":
      return cart.weight;
    case "shipping_method":
      return cart.shippingMethod;
    case "country":
      return cart.address.country;
    case "region":
      return cart.address.region;
    case "postcode":
      return cart.address.postcode;
    case "city":
      return cart.address.city;
    case "customer_group":
      return cart.customer.groupId;
    case "customer_is_guest":
      return cart.customer.isGuest;
    case "store_id":
      return cart.storeId;
    default:
      throw new Error(`Unknown cart field "${field}"`);
  }
}

export function itemField(item, field, catalog = {}) {
  const product = catalog[item.sku] ?? {};
  if (field.startsWith("attr.")) {
    return product.attributes?.[field.slice(5)];
  }
  switch (field) {
    case "sku":
      return item.sku;
    case "qty":
      return item.qty;
    case "price":
      return item.price;
    case "row_total":
      return item.rowTotal;
    case "weight":
      return item.weight;
    case "category_ids":
      return product.categoryIds ?? [];
    default:
      throw new Error(`Unknown item field "${field}"`);
  }
}

export function evaluate(node, read) {
  if (!node) {
    return true;
  }
  if (Array.isArray(node.all)) {
    return node.all.every((child) => evaluate(child, read));
  }
  if (Array.isArray(node.any)) {
    return node.any.some((child) => evaluate(child, read));
  }
  if (node.not) {
    return !evaluate(node.not, read);
  }
  if (typeof node.field === "string") {
    const actual = read(node.field);
    if (actual === undefined || actual === null) {
      return node.op === "neq" || node.op === "nin";
    }
    return compare(actual, node.op ?? "eq", node.value);
  }
  throw new Error("Invalid condition node");
}

export function matchesCart(conditions, cart) {
  return evaluate(conditions, (field) => cartField(cart, field));
}

export function matchesItem(conditions, item, catalog) {
  return evaluate(conditions, (field) => itemField(item, field, catalog));
}

/** Collects every field a condition tree reads, e.g. to decide whether a catalog lookup is needed. */
export function fieldsUsed(node, out = new Set()) {
  if (!node) {
    return out;
  }
  for (const key of ["all", "any"]) {
    if (Array.isArray(node[key])) {
      for (const child of node[key]) {
        fieldsUsed(child, out);
      }
    }
  }
  if (node.not) {
    fieldsUsed(node.not, out);
  }
  if (typeof node.field === "string") {
    out.add(node.field);
  }
  return out;
}
