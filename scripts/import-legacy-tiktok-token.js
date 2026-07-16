import "dotenv/config";

import { createPostgresClient } from "../src/clients/postgresClient.js";
import { createTikTokClient } from "../src/clients/tiktokClient.js";
import { createTokenCipher } from "../src/crypto/tokenCipher.js";
import { createTokenRepository } from "../src/repositories/tokenRepository.js";

const database = createPostgresClient({ connectionString: process.env.DATABASE_URL });
try {
  const legacyResult = await database.query(`
    SELECT access_token, access_token_expire_at, refresh_token, refresh_token_expire_at
    FROM sync_tiktok.token WHERE id = 1
  `);
  const legacy = legacyResult.rows[0];
  if (!legacy?.access_token || !legacy?.refresh_token) throw new Error("Legacy TikTok token id=1 is missing");
  const tiktok = createTikTokClient({
    appKey: process.env.TIKTOK_PARTNER_APP_KEY,
    appSecret: process.env.TIKTOK_PARTNER_APP_SECRET,
    tokenProvider: { getAccessToken: async () => legacy.access_token, refresh: async () => { throw new Error("Refresh is not available during import"); } },
  });
  const authorization = await tiktok.request("/authorization/202309/shops");
  const shops = authorization.shops ?? [];
  if (shops.length === 0) throw new Error("TikTok returned no authorized shops");
  const repository = createTokenRepository({ query: database.query, cipher: createTokenCipher(process.env.AES_256_CBC_APP_SECRET_KEY) });
  for (const shop of shops) {
    await repository.upsert({
      shopId: String(shop.id), shopCipher: shop.cipher, shopName: shop.name,
      accessToken: legacy.access_token, accessTokenExpireAt: legacy.access_token_expire_at,
      refreshToken: legacy.refresh_token, refreshTokenExpireAt: legacy.refresh_token_expire_at,
    });
  }
  console.info(JSON.stringify({ imported: true, shops: shops.map((shop) => ({ shopId: String(shop.id), shopName: shop.name })) }, null, 2));
} finally {
  await database.close();
}
