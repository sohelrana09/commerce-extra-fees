import { defineConfig } from "@adobe/aio-commerce-lib-app/config";

const feeWebhook = {
  batch_name: "extra_fees",
  fallback_error_message:
    "We couldn't calculate the extra fees for your cart. Please try again or contact the store.",
  fields: [
    { name: "total" },
    { name: "quote" },
    { name: "shippingAssignment" },
  ],
  hook_name: "extra_fees",
  method: "POST",
  soft_timeout: 1000,
  timeout: 5000,
  webhook_type: "after",
};

// The order is read in full from Commerce REST; the event only needs its IDs.
const orderEventFields = [
  { name: "entity_id" },
  { name: "increment_id" },
  { name: "quote_id" },
  { name: "created_at" },
];

export default defineConfig({
  adminUi: {
    menu: {
      aclProtected: true,
      description: "Create and manage the extra fees charged at checkout.",
      id: "extra_fees",
      label: "Extra Fees",
    },
  },

  businessConfig: {
    schema: [
      {
        default: true,
        label: "Charge extra fees",
        name: "feesEnabled",
        type: "boolean",
      },
      {
        default: "60",
        label:
          "Minutes to cache product categories and attributes used by fee conditions",
        name: "catalogCacheMinutes",
        type: "text",
      },
    ],
  },

  eventing: {
    commerce: [
      {
        events: [
          {
            description:
              "Records the extra fees charged on each order for fee revenue reports (Adobe Commerce on cloud infrastructure and on-premises).",
            env: ["paas"],
            fields: orderEventFields,
            label: "Order placed (PaaS)",
            name: "plugin.magento.sales.api.order_management.place",
            runtimeActions: ["extra-fees/record-order-fees"],
          },
          {
            description:
              "Records the extra fees charged on each order for fee revenue reports (Adobe Commerce as a Cloud Service).",
            env: ["saas"],
            fields: orderEventFields,
            label: "Order placed (SaaS)",
            name: "plugin.sales.api.order_management.place",
            runtimeActions: ["extra-fees/record-order-fees"],
          },
        ],
        provider: {
          description:
            "Order events used by Extra Fees for fee revenue reports.",
          label: "Extra Fees",
        },
      },
    ],
  },

  installation: {
    customInstallationSteps: [
      {
        description:
          "Provision App Builder Database Storage and create the collections for fee rules, buyer choices, the product cache and order reports.",
        name: "Set up database",
        script: "./scripts/setup-database.js",
      },
    ],
    messages: {
      postInstallation:
        "Extra Fees is installed. Open Sales > Extra Fees in the Commerce Admin to add your first fee. Fees are off until you switch them on.",
      preInstallation:
        "Extra Fees stores fee rules in App Builder Database Storage. Make sure App Builder Data Services is added to your workspace.",
    },
  },
  metadata: {
    description:
      "Add rule-based extra fees to the cart and checkout: fixed or percentage fees, per order, item or unit, with store, customer group, cart, address and product conditions.",
    displayName: "Extra Fees",
    id: "extra-fees",
    version: "0.4.0",
  },

  webhooks: [
    {
      category: "modification",
      description:
        "Adds extra fees to cart totals (Adobe Commerce on cloud infrastructure and on-premises).",
      env: ["paas"],
      label: "Extra Fees (PaaS)",
      requireAdobeAuth: true,
      runtimeAction: "extra-fees/calculate-fees",
      webhook: {
        ...feeWebhook,
        webhook_method:
          "plugin.magento.out_of_process_totals_collector.api.get_total_modifications.custom_fees",
      },
    },
    {
      category: "modification",
      description:
        "Adds extra fees to cart totals (Adobe Commerce as a Cloud Service).",
      env: ["saas"],
      label: "Extra Fees (SaaS)",
      requireAdobeAuth: true,
      runtimeAction: "extra-fees/calculate-fees",
      webhook: {
        ...feeWebhook,
        // SaaS method names drop the "magento." segment, like the totals-collector discount
        // webhook. Confirm with GET /V1/webhooks/supportedList on the target instance.
        webhook_method:
          "plugin.out_of_process_totals_collector.api.get_total_modifications.custom_fees",
      },
    },
  ],
});
