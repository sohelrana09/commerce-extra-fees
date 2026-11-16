// @vitest-environment happy-dom
import { describe, expect, test, vi } from "vitest";

import {
  createFeesClient,
  customFeesTransformer,
  FEE_LINE_SORT_ORDER,
  formatMoney,
  mountFeeOptions,
  renderFeeOptions,
  selectionsFromForm,
  withCustomFees,
} from "../../storefront/scripts/extra-fees.js";

const FEES = [
  {
    amount: 5,
    code: "insurance",
    description: "Covers loss in transit",
    input: "checkbox",
    label: "Insurance",
    options: [],
    selected: false,
    type: "optional",
  },
  {
    amount: null,
    code: "packaging",
    description: "",
    input: "checkbox",
    label: "Packaging",
    options: [
      { amount: 2, code: "box", label: "Box", selected: true },
      { amount: 4, code: "wrap", label: "Gift wrap", selected: false },
    ],
    selected: true,
    type: "optional",
  },
  {
    amount: null,
    code: "delivery",
    input: "radio",
    label: "Delivery",
    options: [
      { amount: 0, code: "standard", label: "Standard", selected: true },
      { amount: 9, code: "express", label: "Express", selected: false },
    ],
    selected: true,
    type: "required",
  },
  {
    amount: null,
    code: "gift",
    input: "dropdown",
    label: "Gift note",
    options: [{ amount: 1, code: "card", label: "Card", selected: false }],
    selected: false,
    type: "optional",
  },
  {
    amount: null,
    code: "speed",
    input: "radio",
    label: "Speed",
    options: [{ amount: 3, code: "fast", label: "Fast", selected: false }],
    selected: false,
    type: "optional",
  },
];

function response(body, ok = true, status = 200) {
  return { json: async () => body, ok, status };
}

function fakeEvents() {
  const handlers = [];
  return {
    emit: (data) => {
      for (const handler of handlers) {
        handler(data);
      }
    },
    on: vi.fn((_name, handler) => {
      handlers.push(handler);
      return { off: vi.fn() };
    }),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("cart data helpers", () => {
  test("customFeesTransformer keeps valid, positive fees", () => {
    expect(
      customFeesTransformer({
        prices: {
          custom_fees: [
            {
              amount: { currency: "USD", value: "15" },
              code: "small",
              label: "Small order",
            },
            { amount: { value: 0 }, code: "zero", label: "Zero" },
            { amount: { value: 2 }, code: "nolabel" },
            null,
          ],
        },
      }),
    ).toEqual({
      customFees: [
        {
          amount: { currency: "USD", value: 15 },
          code: "small",
          label: "Small order",
        },
        {
          amount: { currency: null, value: 2 },
          code: "nolabel",
          label: "nolabel",
        },
      ],
    });
    expect(customFeesTransformer({})).toEqual({ customFees: [] });
  });

  test("withCustomFees adds a line per fee after gift cards", () => {
    const base = [{ key: "subTotalContent", sortOrder: 100 }];
    const lines = withCustomFees(
      base,
      [{ code: "a" }, { code: "b" }],
      (fee) => `line ${fee.code}`,
    );
    expect(lines.slice(1)).toEqual([
      { content: "line a", key: "extraFee_a", sortOrder: FEE_LINE_SORT_ORDER },
      {
        content: "line b",
        key: "extraFee_b",
        sortOrder: FEE_LINE_SORT_ORDER + 1,
      },
    ]);
    expect(withCustomFees(base, [], () => "")).toBe(base);
    expect(withCustomFees(base, undefined, () => "")).toBe(base);
  });

  test("formatMoney", () => {
    expect(formatMoney(5, "USD", "en-US")).toBe("$5.00");
    expect(formatMoney(5, "NOPE", "en-US")).toBe("5.00");
    expect(formatMoney(5, null)).toBe("5.00");
    expect(formatMoney("x", "USD")).toBe("");
  });
});

describe("createFeesClient", () => {
  test("posts JSON and surfaces errors", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ fees: [] }))
      .mockResolvedValueOnce(response({ error: "Cart not found" }, false, 404))
      .mockResolvedValueOnce({
        json: () => Promise.reject(new Error("x")),
        ok: false,
        status: 502,
      });
    const client = createFeesClient("https://x/fee-options", fetchImpl);

    expect(await client.list("cart1")).toEqual({ fees: [] });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      cartId: "cart1",
    });
    await expect(client.save("cart1", { a: true })).rejects.toThrow(
      "Cart not found",
    );
    await expect(client.list("cart1")).rejects.toThrow("Request failed (502)");
  });
});

describe("rendering", () => {
  test("renders every input type and reads choices back", () => {
    const container = document.createElement("div");
    const { form } = renderFeeOptions(container, FEES, {
      currency: "USD",
      locale: "en-US",
    });

    expect(form.querySelector(".extra-fees__title").textContent).toBe(
      "Additional options",
    );
    expect(container.textContent).toContain("+$5.00");
    expect(container.querySelector("select option").textContent).toBe("None");
    expect(form.querySelectorAll('input[name="speed"]')).toHaveLength(2);
    expect(form.querySelectorAll('input[name="delivery"]')).toHaveLength(2);
    expect(selectionsFromForm(form, FEES)).toEqual({
      delivery: "standard",
      packaging: ["box"],
    });

    form.querySelector("#extra-fee-insurance").checked = true;
    form.querySelector("#extra-fee-packaging-wrap").checked = true;
    form.querySelector("#extra-fee-delivery-express").checked = true;
    form.querySelector("select").value = "card";
    form.querySelector("#extra-fee-speed-fast").checked = true;
    expect(selectionsFromForm(form, FEES)).toEqual({
      delivery: "express",
      gift: "card",
      insurance: true,
      packaging: ["box", "wrap"],
      speed: "fast",
    });
  });

  test("uses custom labels", () => {
    const container = document.createElement("div");
    renderFeeOptions(container, FEES.slice(3, 4), {
      labels: { none: "No thanks", title: "Extras" },
    });
    expect(container.querySelector("h2").textContent).toBe("Extras");
    expect(container.querySelector("option").textContent).toBe("No thanks");
  });
});

describe("mountFeeOptions", () => {
  test("loads on cart data, saves on change and refreshes the cart", async () => {
    const events = fakeEvents();
    const refreshCart = vi.fn();
    const saved = FEES.slice(0, 1).map((fee) => ({ ...fee, selected: true }));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response({ currency: "USD", fees: FEES.slice(0, 1) }),
      )
      .mockResolvedValueOnce(response({ currency: "USD", fees: saved }));
    const container = document.createElement("div");
    const stop = mountFeeOptions(container, {
      endpoint: "https://x",
      events,
      fetchImpl,
      locale: "en-US",
      refreshCart,
    });

    expect(container.hidden).toBe(true);
    events.emit({ id: "cart1", totalQuantity: 2 });
    await flush();
    expect(container.hidden).toBe(false);

    const box = container.querySelector("#extra-fee-insurance");
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();

    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({
      cartId: "cart1",
      selections: { insurance: true },
    });
    expect(container.querySelector("#extra-fee-insurance").checked).toBe(true);
    expect(
      container.querySelector(".extra-fees__status").textContent,
    ).toContain("updated");
    expect(refreshCart).toHaveBeenCalledOnce();
    stop();
  });

  test("restores choices and shows an error when saving fails", async () => {
    const events = fakeEvents();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ fees: FEES.slice(0, 1) }))
      .mockResolvedValueOnce(response({ error: "nope" }, false, 500));
    const container = document.createElement("div");
    mountFeeOptions(container, { endpoint: "https://x", events, fetchImpl });
    events.emit({ id: "cart1", totalQuantity: 1 });
    await flush();

    const box = container.querySelector("#extra-fee-insurance");
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    await flush();
    expect(container.querySelector("#extra-fee-insurance").checked).toBe(false);
    expect(
      container.querySelector(".extra-fees__status").textContent,
    ).toContain("couldn't");
  });

  test("hides for empty carts, no fees and failed loads", async () => {
    const events = fakeEvents();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ fees: [] }))
      .mockRejectedValueOnce(new Error("offline"));
    const container = document.createElement("div");
    mountFeeOptions(container, { endpoint: "https://x", events, fetchImpl });

    events.emit({ id: "cart1", totalQuantity: 0 });
    events.emit(null);
    expect(fetchImpl).not.toHaveBeenCalled();

    events.emit({ id: "cart1", totalQuantity: 1 });
    await flush();
    expect(container.hidden).toBe(true);

    events.emit({ id: "cart1", totalQuantity: 1 });
    await flush();
    expect(container.hidden).toBe(true);
  });
});
