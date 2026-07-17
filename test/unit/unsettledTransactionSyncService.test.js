import assert from "node:assert/strict";
import test from "node:test";

import { mapUnsettledTransaction } from "../../src/mappers/unsettledTransactionMapper.js";
import { createUnsettledTransactionSyncService } from "../../src/services/unsettledTransactionSyncService.js";

test("unsettled snapshot creates, updates, keeps, deletes and isolates shops", async () => {
  const shop = { shopId: "shop-1", shopName: "Shop" };
  const unchanged = { id: "same", order_id: "order-1", status: "UNSETTLED" };
  const changed = { id: "changed", order_id: "order-2", status: "UNSETTLED", est_settlement_amount: "20" };
  const created = { id: "created", order_id: "order-3", status: "UNSETTLED" };
  const unchangedFields = mapUnsettledTransaction(unchanged, shop).fields;
  const changedFields = mapUnsettledTransaction({ ...changed, est_settlement_amount: "10" }, shop).fields;
  const writes = { creates: [], updates: [], deletes: [] };
  const larkClient = {
    searchAllRecords: async () => [
      { record_id: "same-new", created_time: 2, fields: unchangedFields },
      { record_id: "same-old", created_time: 1, fields: unchangedFields },
      { record_id: "changed", created_time: 1, fields: changedFields },
      { record_id: "stale", created_time: 1, fields: { "ID định danh (TTS)": "stale_shop-1", "ID Shop": "shop-1" } },
      { record_id: "other-shop", created_time: 1, fields: { "ID định danh (TTS)": "stale_shop-2", "ID Shop": "shop-2" } },
    ],
    batchCreate: async (_base, _table, records) => writes.creates.push(...records),
    batchUpdate: async (_base, _table, records) => writes.updates.push(...records),
    batchDelete: async (_base, _table, recordIds) => writes.deletes.push(...recordIds),
  };
  const service = createUnsettledTransactionSyncService({
    environment: "test",
    larkClient,
    dryRun: false,
    schemaService: { ensureTableSchema: async () => ({ schemaType: "unsettledTransactions" }) },
  });

  const result = await service.sync({ transactions: [unchanged, changed, created], shop });

  assert.equal(result.creates, 1);
  assert.equal(result.updates, 1);
  assert.equal(result.unchanged, 1);
  assert.equal(result.deletes, 2);
  assert.equal(result.duplicates, 1);
  assert.equal(writes.creates.length, 1);
  assert.equal(writes.updates[0].fields["Thực thu (Net)"], 20);
  assert.deepEqual(new Set(writes.deletes), new Set(["same-old", "stale"]));
  assert.equal(writes.deletes.includes("other-shop"), false);
});

test("unsettled snapshot plans deletion without writing in dry run", async () => {
  let writes = 0;
  const service = createUnsettledTransactionSyncService({
    environment: "test",
    dryRun: true,
    larkClient: {
      searchAllRecords: async () => [{
        record_id: "stale",
        fields: { "ID định danh (TTS)": "stale_shop-1", "ID Shop": "shop-1" },
      }],
      batchCreate: async () => { writes += 1; },
      batchUpdate: async () => { writes += 1; },
      batchDelete: async () => { writes += 1; },
    },
    schemaService: { ensureTableSchema: async () => ({ schemaType: "unsettledTransactions" }) },
  });
  const result = await service.sync({ transactions: [], shop: { shopId: "shop-1" } });
  assert.equal(result.deletes, 1);
  assert.equal(result.dryRun, true);
  assert.equal(writes, 0);
});
