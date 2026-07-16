import assert from "node:assert/strict";
import test from "node:test";

import {
  getLarkTableConfig,
  LARK_TABLE_MAPPING,
  validateLarkTableMapping,
} from "../../src/config/larkTableMapping.js";

test("production mapping contains 12 unique tables for every monthly type", () => {
  const config = validateLarkTableMapping("production");
  assert.equal(Object.keys(config.orders).length, 12);
  assert.equal(Object.keys(config.orderItems).length, 12);
  assert.equal(Object.keys(config.finance).length, 12);
});

test("table config resolves the documented month", () => {
  assert.deepEqual(getLarkTableConfig({ environment: "production", type: "orders", month: 7 }), {
    baseId: "Fg8lbmhRuaDGBwsDbcKlCCf3g6b",
    tableId: "tblDhITfQhIBGcla",
  });
});

test("test environment contains all provisioned tables", () => {
  const config = validateLarkTableMapping("test");
  assert.equal(config.baseId, "Df3WbKnmyaeUKJsphablcI8Jgeh");
  assert.equal(Object.keys(config.orders).length, 12);
  assert.equal(Object.keys(config.orderItems).length, 12);
  assert.equal(Object.keys(config.finance).length, 12);
  assert.equal(config.returnOrders, "tbly3C00nrthqV0H");
  assert.equal(config.skus, "tblSu9mTdLHf6CRI");
});
