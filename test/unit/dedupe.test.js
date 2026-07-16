import assert from "node:assert/strict";
import test from "node:test";

import { createDedupLockRepository } from "../../src/repositories/dedupLockRepository.js";
import { buildLarkUniqueIndex, dedupeMappedRecords } from "../../src/utils/dedupe.js";

test("source dedupe keeps the newest record and the later occurrence on ties", () => {
  const result = dedupeMappedRecords([
    { uniqueKey: "1", rawUpdatedAt: 10, value: "old" },
    { uniqueKey: "2", rawUpdatedAt: 5, value: "only" },
    { uniqueKey: "1", rawUpdatedAt: 20, value: "new" },
    { uniqueKey: "2", rawUpdatedAt: 5, value: "later" },
  ]);
  assert.deepEqual(result.map(({ value }) => value), ["new", "later"]);
});

test("Lark duplicate index selects the newest created record without deleting others", () => {
  const first = { record_id: "rec-old", key: "order-1", created_time: 100 };
  const second = { record_id: "rec-new", key: "order-1", created_time: 200 };
  const { canonicalMap, duplicates } = buildLarkUniqueIndex([first, second], (record) => record.key);
  assert.equal(canonicalMap.get("order-1"), second);
  assert.deepEqual(duplicates, [first]);
});

test("token refresh lease skips a locked shop", async () => {
  const repository = createDedupLockRepository({ query: async () => ({ rows: [], rowCount: 0 }) });
  const result = await repository.withLock({ entityType: "token_refresh", entityId: "123" }, async () => "never");
  assert.deepEqual(result, { acquired: false, skipped: true });
});

test("token refresh lease releases its owner token after terminal failure", async () => {
  const calls = [];
  const repository = createDedupLockRepository({
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes("INSERT INTO")) return { rows: [{ expires_at: new Date() }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  });
  await assert.rejects(
    repository.withLock({ entityType: "token_refresh", entityId: "123" }, async () => { throw new Error("terminal"); }),
    /terminal/,
  );
  assert.equal(calls.length, 2);
  assert.match(calls[1].sql, /DELETE FROM/);
  assert.equal(calls[0].values[2], calls[1].values[2]);
});
