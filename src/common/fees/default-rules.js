/**
 * Rules used until the Admin page and database exist (phase 2). Only the small-order fee is on;
 * the others are examples of each feature, switched off. Set FEE_RULES to override all of them.
 */
export const DEFAULT_RULES = [
  {
    calc: { fixed: 15, mode: "fixed" },
    code: "small_order_fee",
    description: "Orders under $250 carry a $15 handling fee.",
    enabled: false,
    label: "Small order fee",
    sortOrder: 10,
    subtotal: { max: 250 },
    type: "automatic",
  },
  {
    calc: { applyPer: "unit", fixed: 4.5, mode: "fixed" },
    code: "oversize_handling",
    description: "Oversized items need freight handling.",
    enabled: false,
    items: { all: [{ field: "attr.oversize", op: "eq", value: "1" }] },
    label: "Oversize handling",
    sortOrder: 20,
    type: "automatic",
  },
  {
    calc: {
      base: { includeShipping: true },
      max: 50,
      min: 2,
      mode: "percent",
      percent: 1.5,
    },
    code: "fuel_surcharge",
    enabled: false,
    label: "Fuel surcharge",
    sortOrder: 30,
    type: "automatic",
  },
  {
    code: "shipping_insurance",
    description: "Cover the shipment against loss or damage.",
    enabled: false,
    input: "radio",
    label: "Shipping insurance",
    options: [
      {
        calc: { fixed: 5, mode: "fixed" },
        code: "basic",
        default: true,
        label: "Basic",
      },
      {
        calc: { fixed: 10, max: 100, mode: "max_of", percent: 2 },
        code: "full",
        label: "Full value",
      },
    ],
    sortOrder: 40,
    type: "optional",
  },
];
