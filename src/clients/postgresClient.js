import pg from "pg";

import { withRetry } from "../utils/retry.js";

const { Pool } = pg;
const TRANSIENT_CODES = new Set(["08003", "08006", "40001", "40P01", "53300", "57P01"]);

export function createPostgresClient({ connectionString, logger } = {}) {
  if (!connectionString) throw new Error("Postgres connectionString is required");
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 });
  const query = (text, values) => withRetry(() => pool.query({ text, values, query_timeout: 30_000 }), {
    shouldRetry: (error) => TRANSIENT_CODES.has(error.code),
    onRetry: ({ attempt, delayMs, error }) => logger?.warn?.({ attempt, delayMs, code: error.code }, "Retrying Postgres query"),
  });
  return Object.freeze({ pool, query, close: () => pool.end() });
}
