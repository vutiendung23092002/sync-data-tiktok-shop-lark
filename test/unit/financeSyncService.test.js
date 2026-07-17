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

test("finance service rejects statements returned outside the requested UTC statement dates", async () => {
  const { service, upserts } = setup();
  const fetchedStatementIds = [];
  const result = await service.sync({
    statements: [
      { id: "day-16", payment_status: "SETTLED", statement_time: 1_784_160_000 },
      { id: "day-17", payment_status: "SETTLED", statement_time: 1_784_246_400 },
      { id: "day-18", payment_status: "SETTLED", statement_time: 1_784_332_800 },
    ],
    shop: { shopId: "shop-1", shopName: "Shop" },
    range: { from: 1_784_221_200, to: 1_784_307_600 },
    statementRange: {
      from: 1_784_246_401,
      to: 1_784_332_801,
      filterFrom: 1_784_246_400,
      filterTo: 1_784_332_800,
    },
    fetchTransactions: async (statement) => {
      fetchedStatementIds.push(statement.id);
      return { status: "SETTLED", transactions: [{ id: `tx-${statement.id}` }] };
    },
  });

  assert.deepEqual(fetchedStatementIds, ["day-17"]);
  assert.equal(result.fetchedStatements, 3);
  assert.equal(result.dedupedStatements, 3);
  assert.equal(result.inRangeStatements, 1);
  assert.equal(result.outOfRangeStatements, 2);
  assert.equal(upserts.length, 1);
  assert.deepEqual(upserts[0].lookup, {
    type: "dateRange",
    fieldName: "Ngày quyết toán",
    from: 1_784_246_400,
    to: 1_784_332_800,
  });
});

test("finance lookup covers transaction statement_time outside its parent statement window", async () => {
  const { service, upserts } = setup();
  await service.sync({
    statements: [{ id: "day-16", payment_status: "SETTLED", statement_time: 1_784_160_000 }],
    shop: { shopId: "shop-1", shopName: "Shop" },
    range: { from: 1_784_134_800, to: 1_784_221_200 },
    statementRange: {
      filterFrom: 1_784_160_000,
      filterTo: 1_784_246_400,
    },
    fetchTransactions: async () => ({
      status: "SETTLED",
      transactions: [{ id: "tx-outside-parent-window", statement_time: 1_784_257_200 }],
    }),
  });

  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].records[0].statementTime, 1_784_257_200);
  assert.deepEqual(upserts[0].lookup, {
    type: "dateRange",
    fieldName: "Ngày quyết toán",
    from: 1_784_160_000,
    to: 1_784_257_201,
  });
});
