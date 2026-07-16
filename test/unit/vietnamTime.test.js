import assert from "node:assert/strict";
import test from "node:test";

import { getVietnamMonth, toVietnamDateTime } from "../../src/utils/vietnamTime.js";

test("month selection always uses Vietnam time at a UTC month boundary", () => {
  assert.equal(getVietnamMonth("2026-06-30T17:00:00.000Z"), 7);
  assert.equal(toVietnamDateTime("2026-06-30T16:59:59.999Z").month, 6);
});

test("epoch seconds and milliseconds resolve to the same Vietnam month", () => {
  const milliseconds = Date.parse("2026-12-31T17:30:00.000Z");
  assert.equal(getVietnamMonth(milliseconds), 1);
  assert.equal(getVietnamMonth(milliseconds / 1000), 1);
});
