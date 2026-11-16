# Contributing to Extra Fees

Bug fixes, new fee conditions, storefront improvements and better documentation are all welcome. For larger changes, open an issue first so we can agree on the approach.

## Getting set up

```bash
git clone https://github.com/sohelrana09/commerce-extra-fees.git
cd commerce-extra-fees
npm install
npm test
```

The unit tests need no Adobe account: Commerce, the database and I/O Runtime are faked. To deploy your copy, follow [docs/installation.md](docs/installation.md); you need an App Builder project, and a Commerce instance in the same Adobe organization to install it on.

## Making a change

1. Fork the repository and create a branch: `git checkout -b feature/your-change`.
2. Follow the [project structure](README.md#project-structure):
   - business logic goes in `src/common/fees` as plain functions with unit tests, so the webhook, the storefront action and the Admin page share it;
   - actions stay thin: read the request, call `src/common`, answer;
   - the webhook must never throw or block a cart: on any error it charges no fee and logs;
   - storefront code in `storefront/` follows the Edge Delivery Services boilerplate's ESLint (Airbnb) and Stylelint rules, not Biome.
3. Keep secrets on the server: never log credentials, tokens or buyer data, and never commit `.env` or `.aio`.
4. Run the checks:

   ```bash
   npm run code:check
   npm run typecheck
   npm test
   ```

5. Update the README, the guides in `docs/` and the [CHANGELOG](CHANGELOG.md) when behaviour, rule fields or setup change.
6. Commit, push the branch and open a pull request that says what changed and how you tested it. If you tried it on a Commerce instance, say which (SaaS or PaaS, and the version).

## Adding a rule field or condition

1. Add it to the engine (`engine.js` or `conditions.js`) and to `validateRule`.
2. If it reads cart data, map it in `cart.js` for all three cart shapes: the webhook payload, a placed order (`orders.js`) and a storefront cart (`storefront-cart.js`).
3. Add it to the Admin editor (`src/commerce-backend-ui-2/web-src/src/components`).
4. Document it in [docs/rules.md](docs/rules.md).

## Reporting bugs and security issues

- Bugs and ideas: [open an issue](https://github.com/sohelrana09/commerce-extra-fees/issues/new/choose).
- Security problems: report them privately, see [SECURITY.md](SECURITY.md).

By contributing you agree to follow the [code of conduct](CODE_OF_CONDUCT.md), and that your contribution is licensed under the [MIT License](LICENSE).
