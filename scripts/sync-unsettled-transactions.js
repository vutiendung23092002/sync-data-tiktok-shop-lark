import { createLarkClient } from "../src/clients/larkClient.js";
import { createPostgresClient } from "../src/clients/postgresClient.js";
import { createTikTokClient } from "../src/clients/tiktokClient.js";
import { loadEnv } from "../src/config/env.js";
import { validateLarkTableMapping } from "../src/config/larkTableMapping.js";
import { createTokenCipher } from "../src/crypto/tokenCipher.js";
import { createDedupLockRepository } from "../src/repositories/dedupLockRepository.js";
import { createTokenRepository } from "../src/repositories/tokenRepository.js";
import { createTikTokTokenService } from "../src/services/tiktokTokenService.js";
import { createUnsettledTransactionSyncService } from "../src/services/unsettledTransactionSyncService.js";
import { createLogger } from "../src/utils/logger.js";

const env = loadEnv();
validateLarkTableMapping(env.syncEnv);
const logger = createLogger({ level: env.logLevel });
const database = createPostgresClient({ connectionString: env.databaseUrl, logger });
const larkClient = createLarkClient({
  appId: env.larkAppId,
  appSecret: env.larkAppSecret,
  logger,
});

try {
  for (const shopConfig of env.shops) {
    if (!shopConfig.shopId) throw new Error("TIKTOK_SHOP_ID is required for single-shop sync");
    const cipher = createTokenCipher(env.encryptionKey);
    const tokenRepository = createTokenRepository({ query: database.query, cipher });
    const lockRepository = createDedupLockRepository({ query: database.query });
    const tokenService = createTikTokTokenService({
      ...shopConfig,
      tokenRepository,
      dedupLockRepository: lockRepository,
    });
    const context = await tokenService.load();
    const tiktok = createTikTokClient({ ...shopConfig, tokenProvider: tokenService, logger });
    const snapshot = await tiktok.getUnsettledTransactions({ shopCipher: context.shopCipher });

    const uniqueTransactionCount = new Set(
      snapshot.transactions.map((transaction) => transaction.id).filter(Boolean),
    ).size;
    if (uniqueTransactionCount !== snapshot.totals.totalCount) {
      throw new Error(
        `Incomplete unsettled snapshot for shop ${context.shopId}: fetched ${snapshot.transactions.length} rows / ${uniqueTransactionCount} unique IDs, API reported ${snapshot.totals.totalCount}`,
      );
    }

    const service = createUnsettledTransactionSyncService({
      environment: env.syncEnv,
      larkClient,
      dryRun: env.dryRun,
      batchSize: env.larkBatchSize,
      logger,
    });
    const result = await service.sync({
      transactions: snapshot.transactions,
      shop: { shopId: context.shopId, shopName: context.shopName },
    });
    logger.info({
      ...result,
      apiTotals: snapshot.totals,
      shopId: context.shopId,
    }, "Unsettled transactions sync completed");
  }
} finally {
  await database.close();
}
