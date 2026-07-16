CREATE TABLE IF NOT EXISTS sync_tiktok.tiktok_token (
  shop_id text PRIMARY KEY,
  shop_cipher text,
  shop_name text,
  access_token text NOT NULL,
  access_token_expire_at timestamptz NOT NULL,
  refresh_token text NOT NULL,
  refresh_token_expire_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
