import { randomUUID } from "node:crypto";

const ACQUIRE_SQL = `
INSERT INTO sync_tiktok.dedup_lock (
  entity_type, entity_id, lock_token, locked_at, expires_at
)
VALUES ($1, $2, $3::uuid, now(), now() + ($4 * interval '1 millisecond'))
ON CONFLICT (entity_type, entity_id) DO UPDATE
SET lock_token = EXCLUDED.lock_token,
    locked_at = now(),
    expires_at = EXCLUDED.expires_at
WHERE sync_tiktok.dedup_lock.expires_at <= now()
RETURNING entity_type, entity_id, lock_token, locked_at, expires_at`;

const RENEW_SQL = `
UPDATE sync_tiktok.dedup_lock
SET expires_at = now() + ($4 * interval '1 millisecond')
WHERE entity_type = $1
  AND entity_id = $2
  AND lock_token = $3::uuid
  AND expires_at > now()
RETURNING expires_at`;

const RELEASE_SQL = `
DELETE FROM sync_tiktok.dedup_lock
WHERE entity_type = $1 AND entity_id = $2 AND lock_token = $3::uuid`;

export function createDedupLockRepository({ query, retry = (operation) => operation(), defaultTtlMs = 5 * 60_000 } = {}) {
  if (typeof query !== "function") throw new Error("query is required");
  if (!Number.isInteger(defaultTtlMs) || defaultTtlMs <= 0) throw new Error("defaultTtlMs must be positive");
  const run = (text, values) => retry(() => query(text, values));

  async function acquire({ entityType, entityId, ttlMs = defaultTtlMs }) {
    if (!entityType || !entityId) throw new Error("entityType and entityId are required");
    const lockToken = randomUUID();
    const result = await run(ACQUIRE_SQL, [String(entityType), String(entityId), lockToken, ttlMs]);
    if (!result.rows?.[0]) return null;
    return Object.freeze({ entityType: String(entityType), entityId: String(entityId), lockToken, expiresAt: result.rows[0].expires_at });
  }

  async function renew(lock, ttlMs = defaultTtlMs) {
    const result = await run(RENEW_SQL, [lock.entityType, lock.entityId, lock.lockToken, ttlMs]);
    return result.rows?.[0]?.expires_at ?? null;
  }

  async function release(lock) {
    const result = await run(RELEASE_SQL, [lock.entityType, lock.entityId, lock.lockToken]);
    return (result.rowCount ?? 0) > 0;
  }

  async function withLock(params, operation) {
    const lock = await acquire(params);
    if (!lock) return Object.freeze({ acquired: false, skipped: true });
    try {
      return Object.freeze({ acquired: true, skipped: false, value: await operation(lock) });
    } finally {
      await release(lock);
    }
  }

  return Object.freeze({ acquire, renew, release, withLock });
}
