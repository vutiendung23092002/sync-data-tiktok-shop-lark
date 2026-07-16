import assert from "node:assert/strict";
import test from "node:test";

import { createLarkUpsertService } from "../../src/services/larkUpsertService.js";

test("DRY_RUN plans creates and field-level protected updates without writing", async () => {
  let writes = 0;
  let lookupInput;
  const client = {
    searchByDateRange: async (_base, _table, input) => {
      lookupInput = input;
      return [{ record_id: "rec-1", created_time: 1, fields: { "ID định danh (TTS)": "existing", "Mã sản phẩm": "MANUAL", "Giá vốn": 10, "Trạng thái": "old" } }];
    },
    batchCreate: async () => { writes += 1; },
    batchUpdate: async () => { writes += 1; },
  };
  const schema = { schemaType: "orderItems", fields: 17, createdFields: [] };
  const service = createLarkUpsertService({
    larkClient: client,
    dryRun: true,
    schemaService: { ensureTableSchema: async () => schema },
  });
  const result = await service.upsert({
    baseId: "base", tableId: "table", protectedFields: ["Mã sản phẩm", "Giá vốn"],
    records: [
      { uniqueKey: "new", fields: { "Mã sản phẩm": "SKU" } },
      { uniqueKey: "existing", fields: { "Mã sản phẩm": "NEW", "Giá vốn": 20, "Trạng thái": "new" } },
    ],
    lookup: { type: "dateRange", fieldName: "Ngày tạo đơn", from: 100, to: 200 },
    schemaType: "orderItems",
  });
  assert.equal(lookupInput.fromMs, 100_000);
  assert.equal(lookupInput.toMs, 200_000);
  assert.ok(lookupInput.fieldNames.includes("ID định danh (TTS)"));
  assert.deepEqual(result, { creates: 1, updates: 1, unchanged: 0, existing: 1, schema, dryRun: true, changedFieldCounts: { "Trạng thái": 1 } });
  assert.equal(writes, 0);
});

test("upsert batches creates when writes are enabled", async () => {
  const batches = [];
  const client = {
    searchAllRecords: async () => [],
    batchCreate: async (_base, _table, records) => batches.push(records),
    batchUpdate: async () => {},
  };
  const service = createLarkUpsertService({
    larkClient: client,
    dryRun: false,
    batchSize: 2,
    schemaService: { ensureTableSchema: async () => ({ schemaType: "skus", fields: 5, createdFields: [] }) },
  });
  await service.upsert({
    baseId: "base",
    tableId: "table",
    records: [1, 2, 3].map((id) => ({ uniqueKey: String(id), fields: { id } })),
    lookup: { type: "all" },
    schemaType: "skus",
  });
  assert.deepEqual(batches.map((batch) => batch.length), [2, 1]);
});

test("upsert fails fast when records are present without a preload strategy", async () => {
  const service = createLarkUpsertService({
    larkClient: {},
    dryRun: true,
    schemaService: { ensureTableSchema: async () => ({}) },
  });
  await assert.rejects(
    service.upsert({ baseId: "base", tableId: "table", records: [{ uniqueKey: "1", fields: {} }], schemaType: "orders" }),
    /lookup strategy is required/,
  );
});

test("upsert requires a schema type before reading or writing records", async () => {
  const service = createLarkUpsertService({
    larkClient: {},
    dryRun: true,
    schemaService: { ensureTableSchema: async () => assert.fail("must not ensure without schemaType") },
  });
  await assert.rejects(
    service.upsert({ baseId: "base", tableId: "table", records: [] }),
    /schemaType is required/,
  );
});
