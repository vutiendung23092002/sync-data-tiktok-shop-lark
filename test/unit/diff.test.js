import assert from "node:assert/strict";
import test from "node:test";

import { diffFields } from "../../src/utils/diff.js";
import { normalizeLarkValue } from "../../src/utils/normalize.js";

test("diffFields returns only fields whose normalized values changed", () => {
  const result = diffFields({
    desired: { status: "PAID", total: "120000", created: 1_720_000_000 },
    current: { status: [{ text: "PAID" }], total: 120000, created: 1_720_000_000_000 },
    fieldTypes: { status: "text", total: "number", created: "datetime" },
  });
  assert.equal(result.hasChanges, false);
  assert.deepEqual(result.changes, {});
});

test("diffFields protects populated Order Item fields", () => {
  const result = diffFields({
    desired: { "Giá vốn": 80000, "Mã sản phẩm": "NEW-SKU", "Trạng thái": "Shipped" },
    current: { "Giá vốn": 75000, "Mã sản phẩm": "MANUAL-SKU", "Trạng thái": "Paid" },
    fieldTypes: { "Giá vốn": "number", "Mã sản phẩm": "text", "Trạng thái": "text" },
    protectedFields: ["Giá vốn", "Mã sản phẩm"],
  });
  assert.deepEqual(result.changes, { "Trạng thái": "Shipped" });
  assert.deepEqual(result.skippedProtectedFields, ["Giá vốn", "Mã sản phẩm"]);
});

test("diffFields fills protected fields when current values are empty or zero", () => {
  const result = diffFields({
    desired: { "Giá vốn": 80000, "Mã sản phẩm": "SKU-1" },
    current: { "Giá vốn": 0, "Mã sản phẩm": "  " },
    fieldTypes: { "Giá vốn": "number", "Mã sản phẩm": "text" },
    protectedFields: ["Giá vốn", "Mã sản phẩm"],
  });
  assert.deepEqual(result.changes, { "Giá vốn": 80000, "Mã sản phẩm": "SKU-1" });
});

test("URL normalization is stable across Lark representations", () => {
  assert.deepEqual(
    normalizeLarkValue([{ text: "Link video đóng hàng", link: "https://example.com/video" }], "url"),
    { text: "Link video đóng hàng", link: "https://example.com/video" },
  );
});
