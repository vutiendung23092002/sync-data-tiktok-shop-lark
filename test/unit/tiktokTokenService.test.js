import assert from "node:assert/strict";
import test from "node:test";

import { createTikTokTokenService } from "../../src/services/tiktokTokenService.js";

function token({ accessToken, expiresInMs }) {
  return {
    accessToken,
    accessTokenExpireAt: new Date(Date.now() + expiresInMs),
    refreshToken: "refresh-token",
    refreshTokenExpireAt: new Date(Date.now() + 60 * 60_000),
  };
}

test("token refresh loser waits until the winner stores a fresh access token", async () => {
  const stale = token({ accessToken: "stale", expiresInMs: 60_000 });
  const fresh = token({ accessToken: "fresh", expiresInMs: 60 * 60_000 });
  const reads = [stale, stale, fresh];
  const delays = [];
  const service = createTikTokTokenService({
    appKey: "app-key",
    appSecret: "app-secret",
    shopId: "shop-1",
    tokenRepository: { get: async () => reads.shift() ?? fresh },
    dedupLockRepository: { withLock: async () => ({ acquired: false, skipped: true }) },
    sleep: async (delayMs) => { delays.push(delayMs); },
    refreshWaitDelaysMs: [100, 200],
  });

  const result = await service.refresh();

  assert.equal(result.accessToken, "fresh");
  assert.deepEqual(delays, [100, 200]);
});

test("token refresh loser fails clearly instead of returning a stale token after timeout", async () => {
  const stale = token({ accessToken: "stale", expiresInMs: 60_000 });
  const service = createTikTokTokenService({
    appKey: "app-key",
    appSecret: "app-secret",
    shopId: "shop-1",
    tokenRepository: { get: async () => stale },
    dedupLockRepository: { withLock: async () => ({ acquired: false, skipped: true }) },
    sleep: async () => {},
    refreshWaitDelaysMs: [100, 200],
  });

  await assert.rejects(service.refresh(), /Timed out waiting for TikTok token refresh/);
});
