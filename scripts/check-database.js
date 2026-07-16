import "dotenv/config";

import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 5_000,
  max: 1,
});

try {
  const connection = await pool.query({
    text: "SELECT current_database() AS database_name, current_user AS database_user, version() AS version",
    query_timeout: 10_000,
  });
  const contracts = await pool.query({
    text: `
      SELECT table_schema, table_name, column_name, data_type
      FROM information_schema.columns
      WHERE (table_schema, table_name) IN (
        ('kiot_legiahan', 'product_cost'),
        ('han_logistics', 'cam_dong_hang')
      )
      ORDER BY table_schema, table_name, ordinal_position
    `,
    query_timeout: 10_000,
  });
  const info = connection.rows[0];
  console.info(JSON.stringify({
    connected: true,
    database: info.database_name,
    user: info.database_user,
    server: info.version.match(/PostgreSQL\s+[^\s]+/)?.[0] ?? "PostgreSQL",
    referenceColumns: contracts.rows,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    connected: false,
    code: error.code ?? null,
    message: error.message,
  }, null, 2));
  process.exitCode = 1;
} finally {
  await pool.end();
}
