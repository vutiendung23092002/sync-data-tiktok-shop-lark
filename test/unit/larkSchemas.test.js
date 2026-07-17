import assert from "node:assert/strict";
import test from "node:test";

import { buildTestTableDefinitions, LARK_SCHEMAS } from "../../src/config/larkSchemas.js";

test("test provisioning defines exactly 39 tables including unsettled transactions", () => {
  const definitions = buildTestTableDefinitions();
  assert.equal(definitions.length, 39);
  assert.equal(new Set(definitions.map(({ name }) => name)).size, 39);
  assert.equal(definitions.some(({ type }) => type === "unsettledTransactions"), true);
});

test("every schema contains its unique ID and excludes legacy hash", () => {
  for (const [type, fields] of Object.entries(LARK_SCHEMAS)) {
    const names = fields.map(({ field_name }) => field_name);
    assert.equal(names.includes(type === "skus" ? "id_sku" : "ID định danh (TTS)"), true);
    assert.equal(names.includes("hash"), false);
    assert.equal(new Set(names).size, names.length);
  }
});
