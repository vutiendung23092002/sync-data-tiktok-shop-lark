import assert from "node:assert/strict";
import test from "node:test";

import { createPackingRepository } from "../../src/repositories/packingRepository.js";
import { createProductCostRepository, normalizeSku } from "../../src/repositories/productCostRepository.js";

test("cost repository normalizes and deduplicates SKU lookup input", async () => {
  let values;
  const repository = createProductCostRepository({ query: async (_sql, params) => {
    values = params[0];
    return { rows: [{ normalized_sku: "sku-1", cost: "50000" }] };
  } });
  const result = await repository.findLatestBySellerSkus([" SKU-1 ", "sku-1"]);
  assert.deepEqual(values, ["sku-1"]);
  assert.equal(result.get("sku-1"), 50000);
  assert.equal(normalizeSku(" SKU-1 "), "sku-1");
});

test("packing repository returns latest lookup map", async () => {
  const repository = createPackingRepository({ query: async () => ({ rows: [{ tracking_number: "TRACK", employee: "An", link_drive: "url", tied_count: "1" }] }) });
  assert.deepEqual(await repository.findLatestByTrackingNumbers(["TRACK"]), new Map([["TRACK", { employee: "An", linkDrive: "url" }]]));
});
