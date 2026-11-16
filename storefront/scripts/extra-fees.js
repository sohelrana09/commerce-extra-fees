/**
 * Extra Fees storefront helpers for Adobe Commerce Edge Delivery Services storefronts.
 *
 * This file has no drop-in imports, so it works with any drop-in version and can be unit
 * tested. The `extra-fees` block and the cart/checkout wiring pass in what they need.
 *
 * - customFeesTransformer: CartModel transformer that adds `customFees` to cart data.
 * - withCustomFees:        adds fee lines to an OrderSummary `updateLineItems` list.
 * - createFeesClient:      calls the app's `fee-options` web action.
 * - mountFeeOptions:       renders the optional/required fee choices and keeps them in sync.
 */

/** Fee lines sit after gift cards (700) and before tax (800) in the order summary. */
export const FEE_LINE_SORT_ORDER = 750;

/** Add to build.mjs `overrideGQLOperations` for `@dropins/storefront-cart`. */
export const CUSTOM_FEES_FRAGMENT = `
  fragment CART_FRAGMENT on Cart {
    prices {
      custom_fees {
        code
        label
        amount {
          value
          currency
        }
      }
    }
  }
`;

/** CartModel transformer: `{ customFees: [{ code, label, amount: { value, currency } }] }`. */
export function customFeesTransformer(data) {
  const fees = data?.prices?.custom_fees;
  if (!Array.isArray(fees)) {
    return { customFees: [] };
  }
  return {
    customFees: fees
      .filter((fee) => fee?.code && Number(fee?.amount?.value) > 0)
      .map((fee) => ({
        amount: {
          currency: fee.amount.currency ?? null,
          value: Number(fee.amount.value),
        },
        code: String(fee.code),
        label: String(fee.label ?? fee.code),
      })),
  };
}

/**
 * Appends one order summary line per fee. `renderLine(fee)` returns the line content, for
 * example an `OrderSummaryLine` with a `Price`.
 */
export function withCustomFees(lineItems, fees, renderLine) {
  if (!Array.isArray(fees) || fees.length === 0) {
    return lineItems;
  }
  const feeLines = fees.slice(0, 40).map((fee, index) => ({
    content: renderLine(fee),
    key: `extraFee_${fee.code}`,
    sortOrder: FEE_LINE_SORT_ORDER + index,
  }));
  return [...lineItems, ...feeLines];
}

export function formatMoney(value, currency, locale) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return '';
  }
  if (currency) {
    try {
      return new Intl.NumberFormat(locale, { currency, style: 'currency' }).format(amount);
    } catch {
      // Unknown currency code: fall through to a plain number.
    }
  }
  return amount.toFixed(2);
}

export function createFeesClient(endpoint, fetchImpl = (...args) => window.fetch(...args)) {
  async function post(body, signal) {
    const response = await fetchImpl(endpoint, {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `Request failed (${response.status})`);
    }
    return data;
  }
  return {
    list: (cartId, signal) => post({ cartId }, signal),
    save: (cartId, selections, signal) => post({ cartId, selections }, signal),
  };
}

/** Reads the form back into `{ [ruleCode]: true | "option" | ["option", ...] }`. */
export function selectionsFromForm(form, fees) {
  const selections = {};
  fees.forEach((fee) => {
    const fields = [...form.querySelectorAll(`[data-fee="${CSS.escape(fee.code)}"]`)];
    if (!fee.options.length) {
      if (fields.some((field) => field.checked)) selections[fee.code] = true;
      return;
    }
    if (fee.input === 'dropdown') {
      const [select] = fields;
      if (select?.value) selections[fee.code] = select.value;
      return;
    }
    const checked = fields.filter((field) => field.checked).map((field) => field.value);
    if (fee.input === 'radio') {
      const [first] = checked;
      if (first) selections[fee.code] = first;
      return;
    }
    selections[fee.code] = checked;
  });
  return selections;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return;
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  });
  children.filter(Boolean).forEach((child) => node.append(child));
  return node;
}

function choice({
  type, name, value, label, price, checked, fee, id,
}) {
  const input = el('input', {
    checked,
    'data-fee': fee.code,
    id,
    name,
    type,
    value,
  });
  input.checked = Boolean(checked);
  return el('label', { className: 'extra-fees__choice', for: id }, [
    input,
    el('span', { className: 'extra-fees__choice-label', text: label }),
    price ? el('span', { className: 'extra-fees__price', text: price }) : null,
  ]);
}

function renderFee(fee, money, labels) {
  const id = (suffix) => `extra-fee-${fee.code}${suffix ? `-${suffix}` : ''}`;
  const description = fee.description
    ? el('p', { className: 'extra-fees__description', id: id('desc'), text: fee.description })
    : null;
  const describedBy = description ? id('desc') : undefined;

  if (!fee.options.length) {
    return el('div', { className: 'extra-fees__fee', 'aria-describedby': describedBy }, [
      choice({
        checked: fee.selected,
        fee,
        id: id(),
        label: fee.label,
        name: fee.code,
        price: `+${money(fee.amount)}`,
        type: 'checkbox',
        value: 'true',
      }),
      description,
    ]);
  }

  if (fee.input === 'dropdown') {
    const select = el('select', { 'data-fee': fee.code, id: id(), name: fee.code });
    if (fee.type !== 'required') {
      select.append(el('option', { text: labels.none, value: '' }));
    }
    fee.options.forEach((option) => {
      const node = el('option', {
        text: `${option.label} (+${money(option.amount)})`,
        value: option.code,
      });
      node.selected = option.selected;
      select.append(node);
    });
    return el('div', { className: 'extra-fees__fee', 'aria-describedby': describedBy }, [
      el('label', { className: 'extra-fees__legend', for: id(), text: fee.label }),
      select,
      description,
    ]);
  }

  const type = fee.input === 'radio' ? 'radio' : 'checkbox';
  const choices = fee.options.map((option) => choice({
    checked: option.selected,
    fee,
    id: id(option.code),
    label: option.label,
    name: fee.code,
    price: `+${money(option.amount)}`,
    type,
    value: option.code,
  }));
  if (type === 'radio' && fee.type !== 'required') {
    choices.unshift(choice({
      checked: !fee.selected,
      fee: { code: `${fee.code}__none` },
      id: id('none'),
      label: labels.none,
      name: fee.code,
      type,
      value: '',
    }));
  }
  return el('fieldset', { className: 'extra-fees__fee', 'aria-describedby': describedBy }, [
    el('legend', { className: 'extra-fees__legend', text: fee.label }),
    ...choices,
    description,
  ]);
}

const DEFAULT_LABELS = {
  error: "We couldn't update your options. Please try again.",
  none: 'None',
  title: 'Additional options',
  updated: 'Your order total has been updated.',
};

/** Renders the fee choices into `container` and returns the form. */
export function renderFeeOptions(container, fees, { currency, locale, labels = {} } = {}) {
  const text = { ...DEFAULT_LABELS, ...labels };
  const money = (value) => formatMoney(value, currency, locale);
  const form = el('form', { className: 'extra-fees__form' }, [
    el('h2', { className: 'extra-fees__title', text: text.title }),
    ...fees.map((fee) => renderFee(fee, money, text)),
  ]);
  form.addEventListener('submit', (event) => event.preventDefault());
  const status = el('p', { 'aria-live': 'polite', className: 'extra-fees__status', role: 'status' });
  container.replaceChildren(form, status);
  return { form, status };
}

/**
 * Shows the fee choices for the current cart and saves changes.
 *
 * @param {HTMLElement} container
 * @param {object} options
 * @param {string} options.endpoint     The app's fee-options web action URL.
 * @param {object} options.events       The drop-in event bus (`@dropins/tools/event-bus.js`).
 * @param {Function} options.refreshCart Refreshes cart totals (`Cart.refreshCart`).
 * @returns {Function} Stops listening for cart changes.
 */
export function mountFeeOptions(container, {
  endpoint,
  events,
  refreshCart,
  locale,
  labels,
  fetchImpl,
} = {}) {
  const client = createFeesClient(endpoint, fetchImpl);
  const text = { ...DEFAULT_LABELS, ...labels };
  let cartId = null;
  let sequence = 0;
  let controller = null;

  container.classList.add('extra-fees');
  container.hidden = true;

  function show(data) {
    const fees = Array.isArray(data?.fees) ? data.fees : [];
    container.hidden = fees.length === 0;
    if (!fees.length) {
      container.replaceChildren();
      return;
    }
    const { form } = renderFeeOptions(container, fees, {
      currency: data.currency,
      labels: text,
      locale,
    });
    form.addEventListener('change', async () => {
      const selections = selectionsFromForm(form, fees);
      sequence += 1;
      const mine = sequence;
      controller?.abort();
      form.setAttribute('aria-busy', 'true');
      form.querySelectorAll('input, select').forEach((field) => { field.disabled = true; });
      try {
        const saved = await client.save(cartId, selections);
        if (mine !== sequence) return;
        show(saved);
        container.querySelector('.extra-fees__status').textContent = text.updated;
        await refreshCart?.();
      } catch {
        if (mine !== sequence) return;
        show(data);
        container.querySelector('.extra-fees__status').textContent = text.error;
      }
    });
  }

  async function load(nextCartId) {
    sequence += 1;
    const mine = sequence;
    controller?.abort();
    controller = typeof AbortController === 'undefined' ? null : new AbortController();
    try {
      const data = await client.list(nextCartId, controller?.signal);
      if (mine === sequence) show(data);
    } catch (error) {
      if (mine === sequence && error?.name !== 'AbortError') {
        container.hidden = true;
      }
    }
  }

  const subscription = events.on('cart/data', (cart) => {
    if (!cart?.id || !(cart.totalQuantity > 0)) {
      cartId = null;
      sequence += 1;
      container.hidden = true;
      container.replaceChildren();
      return;
    }
    cartId = cart.id;
    load(cartId);
  }, { eager: true });

  return () => subscription?.off?.();
}
