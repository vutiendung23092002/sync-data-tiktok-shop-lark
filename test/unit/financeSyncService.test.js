import assert from "node:assert/strict";
import test from "node:test";

import { createFinanceSyncService } from "../../src/services/financeSyncService.js";

function setup() {
  const upserts = [];
  const service = createFinanceSyncService({
    environment: "test",
    larkUpsertService: {
      upsert: async (group) => {
        upserts.push(group);
        return { creates: group.records.length, updates: 0, unchanged: 0, dryRun: true, changedFieldCounts: {} };
      },
    },
  });
  return { service, upserts };
}

test("finance service syncs only settled transaction responses and dedupes transaction IDs", async () => {
  const { service, upserts } = setup();
  const result = await service.sync({
    statements: [
      { id: "paid", payment_status: "PAID", statement_time: 1_720_100_000 },
      { id: "pending", payment_status: "PROCESSING", statement_time: 1_720_100_000 },
      { id: "locked", payment_status: "SETTLED", statement_time: 1_720_100_000 },
    ],
    shop: { shopId: "shop-1", shopName: "Shop" },
    range: { from: 1_720_000_000, to: 1_721_000_000 },
    fetchTransactions: async () => ({ status: "SETTLED", transactions: [
      { id: "tx-1", order_create_time: 1_720_000_000 },
      { id: "tx-1", order_create_time: 1_720_000_000, settlement_amount: "10" },
    ] }),
  });

  assert.equal(result.transactions, 1);
  assert.equal(result.skippedUnsettled, 1);
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].records[0].fields["Thực thu (Net)"], 10);
  assert.deepEqual(upserts[0].lookup, {
    type: "dateRange",
    fieldName: "Ngày quyết toán",
    from: 1_720_000_000,
    to: 1_721_000_000,
  });
});

test("finance service does not write PAID statement unless transaction response is SETTLED", async () => {
  const { service, upserts } = setup();
  const result = await service.sync({
    statements: [{ id: "paid", payment_status: "PAID", statement_time: 1_720_100_000 }],
    shop: { shopId: "shop-1", shopName: "Shop" },
    range: { from: 1_720_000_000, to: 1_721_000_000 },
    fetchTransactions: async () => ({ status: "PROCESSING", transactions: [{ id: "tx-1" }] }),
  });
  assert.equal(result.skippedUnsettled, 1);
  assert.equal(result.transactions, 0);
  assert.equal(upserts.length, 0);
});
