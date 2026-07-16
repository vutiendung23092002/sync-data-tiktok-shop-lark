import { createLarkClient } from "../src/clients/larkClient.js";
import { createPostgresClient } from "../src/clients/postgresClient.js";
import { createTikTokClient } from "../src/clients/tiktokClient.js";
import { loadEnv } from "../src/config/env.js";
import { validateLarkTableMapping } from "../src/config/larkTableMapping.js";
import { createTokenCipher } from "../src/crypto/tokenCipher.js";
import { createDedupLockRepository } from "../src/repositories/dedupLockRepository.js";
import { createPackingRepository } from "../src/repositories/packingRepository.js";
import { createProductCostRepository } from "../src/repositories/productCostRepository.js";
import { createTokenRepository } from "../src/repositories/tokenRepository.js";
import { createLarkUpsertService } from "../src/services/larkUpsertService.js";
import { createOrderSyncService } from "../src/services/orderSyncService.js";
import { createTikTokTokenService } from "../src/services/tiktokTokenService.js";
import { getSyncRange } from "../src/utils/syncRange.js";
import { createLogger } from "../src/utils/logger.js";

const env = loadEnv();
validateLarkTableMapping(env.syncEnv);
const logger = createLogger({ level: env.logLevel });
const database = createPostgresClient({ connectionString: env.databaseUrl, logger });
try {
  for (const shopConfig of env.shops) {
    if (!shopConfig.shopId) throw new Error("TIKTOK_SHOP_ID is required for single-shop sync");
    const cipher = createTokenCipher(env.encryptionKey);
    const tokenRepository = createTokenRepository({ query: database.query, cipher });
    const lockRepository = createDedupLockRepository({ query: database.query });
    const tokenService = createTikTokTokenService({ ...shopConfig, tokenRepository, dedupLockRepository: lockRepository });
    const context = await tokenService.load();
    const tiktok = createTikTokClient({ ...shopConfig, tokenProvider: tokenService, logger });
    const range = getSyncRange(env);
    const orders = await tiktok.searchOrders({ shopCipher: context.shopCipher, createTimeGe: range.from, createTimeLt: range.to });
    const larkClient = createLarkClient({ appId: env.larkAppId, appSecret: env.larkAppSecret, logger });
    const orderService = createOrderSyncService({
      environment: env.syncEnv,
      productCostRepository: createProductCostRepository({ query: database.query }),
      packingRepository: createPackingRepository({ query: database.query, logger }),
      larkUpsertService: createLarkUpsertService({ larkClient, dryRun: env.dryRun, batchSize: env.larkBatchSize, logger }),
    });
    const result = await orderService.sync({ orders, shop: { shopId: context.shopId, shopName: context.shopName }, range });
    logger.info({ ...result, range, shopId: context.shopId }, "Orders sync completed");
  }
} finally {
  await database.close();
}
