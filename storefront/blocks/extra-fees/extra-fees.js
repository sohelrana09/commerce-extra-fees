/**
 * Extra Fees block: lets the buyer choose optional and required fees in the cart.
 *
 * Authoring (all rows optional):
 *   | Extra Fees |                                    |
 *   | Title      | Additional options                 |
 *   | Endpoint   | https://…/extra-fees/fee-options   |
 *
 * Without an Endpoint row, the block reads `commerce-extra-fees-endpoint` from the site config.
 * With no endpoint at all, the block stays hidden.
 */

import { events } from '@dropins/tools/event-bus.js';
import * as Cart from '@dropins/storefront-cart/api.js';
import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';
import { readBlockConfig } from '../../scripts/aem.js';
import { mountFeeOptions } from '../../scripts/extra-fees.js';
import '../../scripts/initializers/cart.js';

function configuredEndpoint() {
  try {
    return getConfigValue('commerce-extra-fees-endpoint');
  } catch {
    return undefined;
  }
}

export default async function decorate(block) {
  const config = readBlockConfig(block);
  const endpoint = config.endpoint || configuredEndpoint();
  block.replaceChildren();
  if (!endpoint) {
    block.hidden = true;
    return;
  }
  mountFeeOptions(block, {
    endpoint,
    events,
    labels: config.title ? { title: config.title } : undefined,
    locale: document.documentElement.lang || undefined,
    refreshCart: () => Cart.refreshCart(),
  });
}
