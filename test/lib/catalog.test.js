import { describe, expect, test, vi } from "vitest";

import {
  clearCatalogCache,
  fetchProducts,
  loadCatalogEntries,
  toCatalogEntry,
} from "../../src/common/fees/catalog.js";
import { CATALOG } from "../../src/common/fees/db.js";
import { createFakeDb } from "../fixtures/fake-db.js";

const product = (sku, extra = {}) => ({
  custom_attributes: [
    { attribute_code: "oversize", value: "1" },
    { attribute_code: "color", value: "49" },
  ],
  extension_attributes: {
    category_links: [{ category_id: "3" }, { category_id: "12" }],
  },
  sku,
  type_id: "simple",
  ...extra,
});

function fakeCommerce(products) {
  const get = vi.fn((_path, { searchParams }) => ({
    json: async () => {
      const skus =
        searchParams[
          "searchCriteria[filter_groups][0][filters][0][value]"
        ].split(",");
      return { items: products.filter((p) => skus.includes(p.sku)) };
    },
  }));
  return { get };
}

describe("toCatalogEntry", () => {
  test("reads attributes and category links", () => {
    expect(toCatalogEntry(product("A"))).toEqual({
      attributes: { color: "49", oversize: "1", type_id: "simple" },
      categoryIds: [3, 12],
    });
  });

  test("falls back to the category_ids attribute and tolerates junk", () => {
    expect(
      toCatalogEntry({
        custom_attributes: [
          { attribute_code: "category_ids", value: ["7", "x"] },
          {},
        ],
      }),
    ).toEqual({ attributes: { category_ids: ["7", "x"] }, categoryIds: [7] });
    expect(toCatalogEntry(undefined)).toEqual({
      attributes: {},
      categoryIds: [],
    });
  });
});

describe("fetchProducts", () => {
  test("batches SKUs into requests of 50", async () => {
    const skus = Array.from({ length: 120 }, (_, i) => `S${i}`);
    const commerce = fakeCommerce(skus.map((sku) => product(sku)));
    const items = await fetchProducts(commerce, skus);
    expect(items).toHaveLength(120);
    expect(commerce.get).toHaveBeenCalledTimes(3);
    expect(commerce.get.mock.calls[0][0]).toBe("products");
  });
});

describe("loadCatalogEntries", () => {
  test("fetches misses, caches them and serves hits from the cache", async () => {
    const db = createFakeDb();
    const commerce = fakeCommerce([product("A"), product("B")]);
    const deps = {
      connect: db.connect,
      getCommerce: async () => commerce,
      now: 1000,
      ttlMs: 500,
    };

    const first = await loadCatalogEntries(["A", "B", "A", ""], {}, deps);
    expect(Object.keys(first).sort()).toEqual(["A", "B"]);
    expect(commerce.get).toHaveBeenCalledOnce();
    expect(db.collections.get(CATALOG)).toHaveLength(2);

    await loadCatalogEntries(["A"], {}, { ...deps, now: 1400 });
    expect(commerce.get).toHaveBeenCalledOnce();

    await loadCatalogEntries(["A"], {}, { ...deps, now: 1600 });
    expect(commerce.get).toHaveBeenCalledTimes(2);
    expect(db.collections.get(CATALOG)).toHaveLength(2);
  });

  test("returns what it has when Commerce fails", async () => {
    const db = createFakeDb();
    db.seed(CATALOG, [
      { attributes: { a: 1 }, categoryIds: [1], expiresAt: 9999, sku: "A" },
    ]);
    const logger = { warn: vi.fn() };
    const catalog = await loadCatalogEntries(
      ["A", "B"],
      {},
      {
        connect: db.connect,
        getCommerce: async () => {
          throw new Error("down");
        },
        logger,
        now: 1,
      },
    );
    expect(catalog).toEqual({ A: { attributes: { a: 1 }, categoryIds: [1] } });
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  test("does nothing for an empty SKU list", async () => {
    const getCommerce = vi.fn();
    expect(await loadCatalogEntries([], {}, { getCommerce })).toEqual({});
    expect(getCommerce).not.toHaveBeenCalled();
  });

  test("clearCatalogCache empties the cache", async () => {
    const db = createFakeDb();
    db.seed(CATALOG, [{ sku: "A" }, { sku: "B" }]);
    expect(await clearCatalogCache({}, db.connect)).toBe(2);
    expect(db.collections.get(CATALOG)).toHaveLength(0);
  });
});
