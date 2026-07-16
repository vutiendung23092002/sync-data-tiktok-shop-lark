CREATE SCHEMA IF NOT EXISTS sync_tiktok;

DO $$
DECLARE
  table_name text;
  source_relation regclass;
  target_relation regclass;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'instance_booking_dedup',
    'order_dedup',
    'skus',
    'token'
  ]
  LOOP
    source_relation := to_regclass(format('%I.%I', 'tiktok_sync', table_name));
    target_relation := to_regclass(format('%I.%I', 'sync_tiktok', table_name));

    IF source_relation IS NOT NULL AND target_relation IS NOT NULL THEN
      RAISE EXCEPTION
        'Cannot consolidate schemas: both tiktok_sync.% and sync_tiktok.% exist',
        table_name,
        table_name;
    ELSIF source_relation IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE %I.%I SET SCHEMA %I',
        'tiktok_sync',
        table_name,
        'sync_tiktok'
      );
    ELSIF target_relation IS NULL THEN
      RAISE NOTICE
        'Skipping legacy table % because it does not exist in either schema',
        table_name;
    END IF;
  END LOOP;

  -- An owned sequence normally follows ALTER TABLE SET SCHEMA. Keep this
  -- fallback for databases where the legacy ownership metadata is missing.
  IF to_regclass('tiktok_sync.token_id_seq') IS NOT NULL THEN
    IF to_regclass('sync_tiktok.token_id_seq') IS NOT NULL THEN
      RAISE EXCEPTION
        'Cannot consolidate schemas: both token_id_seq sequences exist';
    END IF;
    ALTER SEQUENCE tiktok_sync.token_id_seq SET SCHEMA sync_tiktok;
  END IF;
END
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'instance_booking_dedup',
    'order_dedup',
    'skus',
    'token'
  ]
  LOOP
    IF to_regclass(format('%I.%I', 'tiktok_sync', table_name)) IS NOT NULL THEN
      RAISE EXCEPTION 'Legacy table still exists at tiktok_sync.%', table_name;
    END IF;
  END LOOP;
END
$$;

-- Deliberately do not drop tiktok_sync. The schema is left in place so it can
-- be reviewed and removed manually after all external callers have switched.
