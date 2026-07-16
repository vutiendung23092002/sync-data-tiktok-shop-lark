import "dotenv/config";

import { z } from "zod";

const DATE_PATTERN = /^\d{4}\/\d{2}\/\d{2}$/;

const booleanString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const baseSchema = z
  .object({
    SYNC_ENV: z.enum(["production", "test"]),
    FROM: z.string().regex(DATE_PATTERN),
    TO: z.string().regex(DATE_PATTERN),
    DRY_RUN: booleanString,
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]),
    TIKTOK_SHOP_IDS: z.string().min(1).optional(),
    LARK_APP_ID: z.string().min(1),
    LARK_APP_SECRET: z.string().min(1),
    LARK_BATCH_SIZE: z.coerce.number().int().min(1).max(1000),
    DATABASE_URL: z.string().min(1),
    AES_256_CBC_APP_SECRET_KEY: z.string().min(1),
  });

function parseShopIds(value) {
  const shopIds = [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
  if (shopIds.length === 0) throw new Error("TIKTOK_SHOP_IDS must contain at least one shop ID");
  return shopIds;
}

export function decodeEncryptionKey(value) {
  if (typeof value !== "string" || !value) throw new Error("AES_256_CBC_APP_SECRET_KEY is required");
  let key;
  if (value.startsWith("hex:")) key = Buffer.from(value.slice(4), "hex");
  else if (value.startsWith("base64:")) key = Buffer.from(value.slice(7), "base64");
  else key = Buffer.from(value, "utf8");
  if (key.length !== 32) throw new Error("AES_256_CBC_APP_SECRET_KEY must decode to exactly 32 bytes");
  return key;
}

export function loadEnv(source = process.env) {
  const parsed = baseSchema.parse(source);
  const shopIds = parsed.TIKTOK_SHOP_IDS ? parseShopIds(parsed.TIKTOK_SHOP_IDS) : [];
  decodeEncryptionKey(parsed.AES_256_CBC_APP_SECRET_KEY);

  let shops = shopIds.map((shopId) => {
    const appKeyName = `TIKTOK_PARTNER_APP_KEY_${shopId}`;
    const appSecretName = `TIKTOK_PARTNER_APP_SECRET_${shopId}`;
    const appKey = source[appKeyName]?.trim();
    const appSecret = source[appSecretName]?.trim();
    if (!appKey || !appSecret) {
      throw new Error(`Missing ${!appKey ? appKeyName : appSecretName}`);
    }
    return Object.freeze({ shopId, appKey, appSecret });
  });
  if (shops.length === 0) {
    const appKey = source.TIKTOK_PARTNER_APP_KEY?.trim();
    const appSecret = source.TIKTOK_PARTNER_APP_SECRET?.trim();
    if (!appKey || !appSecret) throw new Error("Missing TIKTOK_PARTNER_APP_KEY or TIKTOK_PARTNER_APP_SECRET");
    shops = [Object.freeze({ shopId: source.TIKTOK_SHOP_ID?.trim() || null, appKey, appSecret })];
  }

  return Object.freeze({
    syncEnv: parsed.SYNC_ENV,
    from: parsed.FROM,
    to: parsed.TO,
    dryRun: parsed.DRY_RUN,
    logLevel: parsed.LOG_LEVEL,
    larkAppId: parsed.LARK_APP_ID,
    larkAppSecret: parsed.LARK_APP_SECRET,
    larkBatchSize: parsed.LARK_BATCH_SIZE,
    databaseUrl: parsed.DATABASE_URL,
    encryptionKey: parsed.AES_256_CBC_APP_SECRET_KEY,
    shops: Object.freeze(shops),
  });
}
