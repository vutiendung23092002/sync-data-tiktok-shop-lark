import assert from "node:assert/strict";
import test from "node:test";
import { DateTime } from "luxon";

import { getFinanceStatementRange, getSyncRange } from "../../src/utils/syncRange.js";

const now = DateTime.fromISO("2026-07-16T10:00:00+07:00", { setZone: true });

test("sync range preserves TO when it is before today and includes the full date", () => {
  const range = getSyncRange({ from: "2026/06/01", to: "2026/07/14" }, now);
  assert.equal(range.effectiveTo, "2026/07/14");
  assert.equal(range.toWasCapped, false);
  assert.equal(DateTime.fromSeconds(range.to - 1).setZone("Asia/Ho_Chi_Minh").toISODate(), "2026-07-14");
});

test("sync range caps today and future TO values to yesterday", () => {
  for (const to of ["2026/07/16", "2026/08/01"]) {
    const range = getSyncRange({ from: "2026/06/01", to }, now);
    assert.equal(range.effectiveTo, "2026/07/15");
    assert.equal(range.toWasCapped, true);
  }
});

test("sync range rejects FROM later than the capped TO", () => {
  assert.throws(
    () => getSyncRange({ from: "2026/07/16", to: "2026/08/01" }, now),
    /after limiting TO to yesterday/,
  );
});

test("Return Orders policy preserves today and caps only future TO values to today", () => {
  const todayRange = getSyncRange({ from: "2026/06/01", to: "2026/07/16" }, now, { maxTo: "today" });
  const futureRange = getSyncRange({ from: "2026/06/01", to: "2026/08/01" }, now, { maxTo: "today" });
  assert.equal(todayRange.effectiveTo, "2026/07/16");
  assert.equal(todayRange.toWasCapped, false);
  assert.equal(futureRange.effectiveTo, "2026/07/16");
  assert.equal(futureRange.toWasCapped, true);
  assert.equal(futureRange.maxToPolicy, "today");
});

test("Finance statement range uses UTC calendar dates and avoids exact midnight API boundaries", () => {
  const financeNow = DateTime.fromISO("2026-07-17T10:00:00+07:00", { setZone: true });
  const range = getSyncRange({ from: "2026/07/15", to: "2026/07/16" }, financeNow);
  const statementRange = getFinanceStatementRange(range);

  assert.equal(DateTime.fromSeconds(range.from).toUTC().toISO(), "2026-07-14T17:00:00.000Z");
  assert.equal(DateTime.fromSeconds(range.to).toUTC().toISO(), "2026-07-16T17:00:00.000Z");
  assert.equal(DateTime.fromSeconds(statementRange.from).toUTC().toISO(), "2026-07-15T00:00:01.000Z");
  assert.equal(DateTime.fromSeconds(statementRange.to).toUTC().toISO(), "2026-07-17T00:00:01.000Z");
  assert.equal(DateTime.fromSeconds(statementRange.filterFrom).toUTC().toISO(), "2026-07-15T00:00:00.000Z");
  assert.equal(DateTime.fromSeconds(statementRange.filterTo).toUTC().toISO(), "2026-07-17T00:00:00.000Z");
});
