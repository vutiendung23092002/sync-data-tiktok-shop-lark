import { fetchWithRetry } from "../utils/retry.js";

const REFRESH_URL = "https://auth.tiktok-shops.com/api/v2/token/refresh";

export function createTikTokTokenService({ appKey, appSecret, shopId, tokenRepository, dedupLockRepository, fetchImpl = globalThis.fetch } = {}) {
  let cached;
  async function load() {
    cached = await tokenRepository.get(shopId);
    if (!cached) throw new Error(`No TikTok token stored for shop ${shopId}`);
    return cached;
  }
  async function refresh() {
    const result = await dedupLockRepository.withLock({ entityType: "token_refresh", entityId: shopId }, async () => {
      const current = await load();
      if (new Date(current.refreshTokenExpireAt).getTime() <= Date.now()) throw new Error("TikTok refresh token expired; manual re-authorization is required");
      const url = new URL(REFRESH_URL);
      url.searchParams.set("app_key", appKey);
      url.searchParams.set("app_secret", appSecret);
      url.searchParams.set("refresh_token", current.refreshToken);
      url.searchParams.set("grant_type", "refresh_token");
      const response = await fetchWithRetry(url, {}, { fetchImpl, operation: "TikTok token refresh" });
      const payload = await response.json();
      if (payload.code !== 0) throw new Error(`TikTok token refresh failed: ${payload.message ?? payload.code}`);
      const data = payload.data;
      await tokenRepository.upsert({
        ...current,
        accessToken: data.access_token,
        accessTokenExpireAt: new Date(Number(data.access_token_expire_in) * 1000),
        refreshToken: data.refresh_token,
        refreshTokenExpireAt: new Date(Number(data.refresh_token_expire_in) * 1000),
      });
      return load();
    });
    if (!result.acquired) return load();
    return result.value;
  }
  async function getAccessToken() {
    const token = cached ?? await load();
    if (new Date(token.accessTokenExpireAt).getTime() <= Date.now() + 5 * 60_000) return (await refresh()).accessToken;
    return token.accessToken;
  }
  function isExpiredResponse(payload) {
    return /access.?token.*(expired|invalid)/i.test(payload?.message ?? "");
  }
  return Object.freeze({ getAccessToken, refresh, isExpiredResponse, load });
}
