import "dotenv/config";

import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000, max: 1 });
try {
  const legacyExists = await pool.query("SELECT to_regclass('sync_tiktok.token') AS table_name");
  const current = await pool.query("SELECT shop_id, access_token_expire_at, refresh_token_expire_at FROM sync_tiktok.tiktok_token ORDER BY shop_id");
  let legacy = [];
  if (legacyExists.rows[0]?.table_name) {
    const result = await pool.query(`
      SELECT id, access_token_expire_at, refresh_token_expire_at,
             length(access_token) AS access_length,
             length(refresh_token) AS refresh_length,
             array_length(regexp_split_to_array(access_token, ':'), 1) AS access_parts
      FROM sync_tiktok.token ORDER BY id
    `);
    legacy = result.rows;
  }
  console.info(JSON.stringify({ legacyTableExists: Boolean(legacyExists.rows[0]?.table_name), legacy, current: current.rows }, null, 2));
} finally {
  await pool.end();
}
