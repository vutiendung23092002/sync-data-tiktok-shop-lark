import assert from "node:assert/strict";
import test from "node:test";

import { mapSkusFromOrders } from "../../src/mappers/skuMapper.js";

test("SKU mapper dedupes by sku_id and keeps the most populated occurrence", () => {
  const records = mapSkusFromOrders([
    { update_time: 1, line_items: [{ sku_id: "sku-1", seller_sku: "SELLER-1", product_name: "Product" }] },
    { update_time: 2, line_items: [{ sku_id: "sku-1", seller_sku: "SELLER-1", sku_name: "Variant", product_id: "product-1", product_name: "Product" }] },
  ]);
  assert.equal(records.length, 1);
  assert.equal(records[0].uniqueKey, "sku-1");
  assert.deepEqual(records[0].fields, {
    id_sku: "sku-1",
    seller_sku: "SELLER-1",
    sku_name: "Variant",
    product_id: "product-1",
    product_name: "Product",
  });
});

test("SKU mapper ignores line items without sku_id", () => {
  assert.deepEqual(mapSkusFromOrders([{ line_items: [{ seller_sku: "missing-id" }] }]), []);
});
