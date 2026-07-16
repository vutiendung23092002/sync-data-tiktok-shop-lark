import assert from "node:assert/strict";
import test from "node:test";

import { loadEnv } from "../../src/config/env.js";

function validEnv(overrides = {}) {
  return {
    SYNC_ENV: "production",
    FROM: "2026/06/01",
    TO: "2026/07/15",
    DRY_RUN: "true",
    LOG_LEVEL: "info",
    TIKTOK_SHOP_IDS: "123",
    TIKTOK_PARTNER_APP_KEY_123: "app-key",
    TIKTOK_PARTNER_APP_SECRET_123: "app-secret",
    LARK_APP_ID: "lark-id",
    LARK_APP_SECRET: "lark-secret",
    LARK_BATCH_SIZE: "500",
    DATABASE_URL: "postgresql://user:pass@localhost/db",
    AES_256_CBC_APP_SECRET_KEY: "a".repeat(32),
    ...overrides,
  };
}

test("loadEnv parses explicit safe operating switches", () => {
  const env = loadEnv(validEnv());
  assert.equal(env.syncEnv, "production");
  assert.equal(env.dryRun, true);
  assert.deepEqual(env.shops.map(({ shopId }) => shopId), ["123"]);
});

test("loadEnv fails fast when SYNC_ENV is absent", () => {
  const source = validEnv();
  delete source.SYNC_ENV;
  assert.throws(() => loadEnv(source));
});

test("loadEnv always requires FROM and TO", () => {
  const withoutRange = validEnv();
  delete withoutRange.FROM;
  delete withoutRange.TO;
  assert.throws(() => loadEnv(withoutRange), /FROM/);
});

test("loadEnv enforces the documented Lark batch hard cap", () => {
  assert.throws(() => loadEnv(validEnv({ LARK_BATCH_SIZE: "1001" })));
});
