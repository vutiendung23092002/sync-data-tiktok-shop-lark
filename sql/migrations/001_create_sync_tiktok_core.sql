CREATE SCHEMA IF NOT EXISTS sync_tiktok;

CREATE TABLE IF NOT EXISTS sync_tiktok.dedup_lock (
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  lock_token uuid NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);

COMMENT ON TABLE sync_tiktok.dedup_lock IS
  'Cross-workflow lock for TikTok token refresh; business entities are deduped in memory and against Lark';

CREATE INDEX IF NOT EXISTS dedup_lock_expires_at_idx
  ON sync_tiktok.dedup_lock (expires_at);

CREATE TABLE IF NOT EXISTS sync_tiktok.sync_run_log (
  id bigserial PRIMARY KEY,
  run_type text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text CHECK (status IN ('success', 'failed', 'partial')),
  detail jsonb
);
