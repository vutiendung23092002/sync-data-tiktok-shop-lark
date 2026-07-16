import assert from "node:assert/strict";
import test from "node:test";

import { HttpError, isRetryableError, withRetry } from "../../src/utils/retry.js";

test("withRetry applies exponential backoff to retryable network errors", async () => {
  const delays = [];
  let calls = 0;
  const value = await withRetry(async () => {
    calls += 1;
    if (calls < 3) throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
    return "ok";
  }, { sleep: async (delay) => delays.push(delay) });

  assert.equal(value, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2000]);
});

test("withRetry honors Retry-After", async () => {
  const delays = [];
  let calls = 0;
  await withRetry(async () => {
    calls += 1;
    if (calls === 1) {
      throw new HttpError("rate limited", { response: { status: 429, headers: { "retry-after": "3" } } });
    }
  }, { sleep: async (delay) => delays.push(delay) });
  assert.deepEqual(delays, [3000]);
});

test("withRetry does not retry non-429 client errors", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => {
      calls += 1;
      throw new HttpError("bad request", { status: 400 });
    }, { sleep: async () => {} }),
    /bad request/,
  );
  assert.equal(calls, 1);
});

test("Lark rate-limit and internal codes are retryable", () => {
  assert.equal(isRetryableError({ body: { code: 1254290 } }), true);
  assert.equal(isRetryableError({ body: { code: 1255001 } }), true);
  assert.equal(isRetryableError({ body: { code: 1254015 } }), false);
});
