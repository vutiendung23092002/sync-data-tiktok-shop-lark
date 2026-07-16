import "dotenv/config";

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000, max: 1 });
const migrations = [
  "001_create_sync_tiktok_core.sql",
  "002_create_tiktok_token.sql",
  "003_move_legacy_tables_to_sync_tiktok.sql",
];

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('sync_tiktok_migrations'))");
  for (const migration of migrations) {
    const migrationUrl = new URL(`../sql/migrations/${migration}`, import.meta.url);
    await client.query(await readFile(fileURLToPath(migrationUrl), "utf8"));
  }
  await client.query("COMMIT");
  console.info(JSON.stringify({ migrated: true, migrations }));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
