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
  assert.equal(config.unsettledTransactions, "tblkcawPHaBJQqSp");
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
  assert.equal(config.unsettledTransactions, "tbl0uBF1PCAVgEne");
});

test("table config resolves the unsettled snapshot table without a month", () => {
  assert.deepEqual(getLarkTableConfig({ environment: "test", type: "unsettledTransactions" }), {
    baseId: "Df3WbKnmyaeUKJsphablcI8Jgeh",
    tableId: "tbl0uBF1PCAVgEne",
  });
});
