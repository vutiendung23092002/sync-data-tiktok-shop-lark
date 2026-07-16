export function createTokenRepository({ query, cipher } = {}) {
  if (typeof query !== "function" || !cipher) throw new Error("query and cipher are required");
  async function get(shopId) {
    const result = await query(`
      SELECT shop_id, shop_cipher, shop_name, access_token, access_token_expire_at,
             refresh_token, refresh_token_expire_at, updated_at
      FROM sync_tiktok.tiktok_token WHERE shop_id = $1
    `, [shopId]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      shopId: row.shop_id, shopCipher: row.shop_cipher, shopName: row.shop_name,
      accessToken: cipher.decrypt(row.access_token), accessTokenExpireAt: row.access_token_expire_at,
      refreshToken: cipher.decrypt(row.refresh_token), refreshTokenExpireAt: row.refresh_token_expire_at,
      updatedAt: row.updated_at,
    };
  }
  async function upsert(token) {
    await query(`
      INSERT INTO sync_tiktok.tiktok_token (
        shop_id, shop_cipher, shop_name, access_token, access_token_expire_at,
        refresh_token, refresh_token_expire_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
      ON CONFLICT (shop_id) DO UPDATE SET
        shop_cipher = EXCLUDED.shop_cipher, shop_name = EXCLUDED.shop_name,
        access_token = EXCLUDED.access_token, access_token_expire_at = EXCLUDED.access_token_expire_at,
        refresh_token = EXCLUDED.refresh_token, refresh_token_expire_at = EXCLUDED.refresh_token_expire_at,
        updated_at = now()
    `, [
      token.shopId, token.shopCipher ?? null, token.shopName ?? null,
      cipher.encrypt(token.accessToken), token.accessTokenExpireAt,
      cipher.encrypt(token.refreshToken), token.refreshTokenExpireAt,
    ]);
  }
  return Object.freeze({ get, upsert });
}
