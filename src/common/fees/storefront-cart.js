/**
 * Reads a storefront cart through Commerce REST and shapes it like the totals-collector webhook
 * payload, so the storefront sees exactly the fees and prices the webhook will charge.
 *
 * The storefront only knows the masked cart ID (the one GraphQL uses, for guest and signed-in
 * carts alike). `GET /V1/guest-carts/{maskedId}` turns it into the quote, whose internal ID the
 * webhook payload carries. The masked ID is a long random token, so knowing it is what proves
 * the caller owns the cart, as it is for Commerce's own guest cart APIs.
 */

const MASKED_ID = /^[A-Za-z0-9_-]{16,64}$/u;

export class CartNotFoundError extends Error {
  // biome-ignore lint/style/useConsistentMemberAccessibility: plain JavaScript has no access modifiers
  constructor(message, options) {
    super(message ?? "Cart not found", options);
    this.name = "CartNotFoundError";
  }
}

export function isMaskedCartId(value) {
  return typeof value === "string" && MASKED_ID.test(value);
}

function byItemId(list) {
  return new Map(
    (list ?? []).map((line) => [String(line.item_id ?? line.itemId), line]),
  );
}

/** Merges cart items (SKU, quantity) with totals items (base prices) by item ID. */
function toItems(cart, totals) {
  const totalsItems = byItemId(totals?.items);
  return (cart?.items ?? []).map((line) => {
    const priced = totalsItems.get(String(line.item_id)) ?? {};
    return {
      base_discount_amount: priced.base_discount_amount,
      base_price: priced.base_price ?? line.price,
      base_row_total: priced.base_row_total,
      item_id: line.item_id,
      qty: line.qty,
      sku: line.sku,
    };
  });
}

/** Builds a webhook-shaped payload from REST `cart` and `totals` responses. */
export function toWebhookPayload(cart, totals) {
  const shipping =
    cart?.extension_attributes?.shipping_assignments?.[0]?.shipping ?? {};
  return {
    quote: {
      customer_group_id: cart?.customer?.group_id ?? 0,
      customer_id: cart?.customer?.id ?? null,
      customer_is_guest: Boolean(
        cart?.customer_is_guest ?? !cart?.customer?.id,
      ),
      entity_id: cart?.id,
      store_id: cart?.store_id,
    },
    shippingAssignment: {
      items: toItems(cart, totals),
      shipping: {
        address: shipping.address ?? cart?.billing_address ?? {},
        method: shipping.method ?? "",
      },
    },
    total: {
      base_discount_amount: totals?.base_discount_amount,
      base_shipping_amount: totals?.base_shipping_amount,
      base_subtotal: totals?.base_subtotal,
    },
  };
}

function isNotFound(error) {
  const status = error?.response?.status ?? error?.status;
  return status === 404 || status === 400;
}

/**
 * Loads the cart behind a masked ID. Returns { quoteId, currency, payload }.
 * Throws CartNotFoundError when Commerce doesn't know the cart.
 */
export async function loadStorefrontCart(commerce, maskedId) {
  if (!isMaskedCartId(maskedId)) {
    throw new CartNotFoundError("Invalid cart ID");
  }
  const path = `guest-carts/${encodeURIComponent(maskedId)}`;
  try {
    const [cart, totals] = await Promise.all([
      commerce.get(path).json(),
      commerce.get(`${path}/totals`).json(),
    ]);
    if (!cart?.id) {
      throw new CartNotFoundError(undefined);
    }
    return {
      currency: totals?.base_currency_code ?? null,
      payload: toWebhookPayload(cart, totals),
      quoteId: cart.id,
    };
  } catch (error) {
    if (error instanceof CartNotFoundError) {
      throw error;
    }
    if (isNotFound(error)) {
      throw new CartNotFoundError("Cart not found", { cause: error });
    }
    throw error;
  }
}
