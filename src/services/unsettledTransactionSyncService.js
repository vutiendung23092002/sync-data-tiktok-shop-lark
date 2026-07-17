import { getLarkTableConfig } from "../config/larkTableMapping.js";
import { LARK_FIELD_TYPES, LARK_SCHEMAS } from "../config/larkSchemas.js";
import { dedupeMappedRecords, buildLarkUniqueIndex } from "../utils/dedupe.js";
import { diffFields } from "../utils/diff.js";
import { normalizeLarkValue } from "../utils/normalize.js";
import { mapUnsettledTransaction } from "../mappers/unsettledTransactionMapper.js";
import { createLarkSchemaService } from "./larkSchemaService.js";

const UNIQUE_FIELD = "ID định danh (TTS)";
const SHOP_FIELD = "ID Shop";

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function belongsToShop(record, shopId) {
  const normalizedShopId = String(shopId);
  const recordShopId = normalizeLarkValue(record.fields?.[SHOP_FIELD], "text");
  if (recordShopId != null) return recordShopId === normalizedShopId;
  const uniqueKey = normalizeLarkValue(record.fields?.[UNIQUE_FIELD], "text");
  return uniqueKey?.endsWith(`_${normalizedShopId}`) ?? false;
}

export function createUnsettledTransactionSyncService({
  environment,
  larkClient,
  dryRun,
  batchSize = 500,
  logger,
  schemaService,
} = {}) {
  if (!environment) throw new Error("environment is required");
  if (!larkClient) throw new Error("larkClient is required");
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("batchSize must be a positive integer");
  const tableSchemaService = schemaService ?? createLarkSchemaService({ larkClient, logger });
  const writeBatchSize = Math.min(batchSize, 500);

  async function sync({ transactions, shop }) {
    if (!shop?.shopId) throw new Error("shop.shopId is required");
    if (!Array.isArray(transactions)) throw new Error("transactions must be an array");

    const { baseId, tableId } = getLarkTableConfig({
      environment,
      type: "unsettledTransactions",
    });
    const schema = await tableSchemaService.ensureTableSchema({
      baseId,
      tableId,
      schemaType: "unsettledTransactions",
      createMissing: !dryRun,
    });
    const mapped = dedupeMappedRecords(
      transactions.map((transaction) => mapUnsettledTransaction(transaction, shop)),
    );
    const desiredByKey = new Map(mapped.map((record) => [record.uniqueKey, record]));
    const fieldNames = LARK_SCHEMAS.unsettledTransactions.map((field) => field.field_name);
    const allExisting = await larkClient.searchAllRecords(baseId, tableId, { fieldNames });
    const existing = allExisting.filter((record) => belongsToShop(record, shop.shopId));
    const { canonicalMap, duplicates } = buildLarkUniqueIndex(
      existing,
      (record) => normalizeLarkValue(record.fields?.[UNIQUE_FIELD], "text"),
    );

    const creates = [];
    const updates = [];
    const deleteIds = new Set(duplicates.map((record) => record.record_id).filter(Boolean));
    const changedFieldCounts = new Map();
    let unchanged = 0;

    for (const record of mapped) {
      const current = canonicalMap.get(record.uniqueKey);
      if (!current) {
        creates.push({ fields: record.fields });
        continue;
      }
      const diff = diffFields({
        desired: record.fields,
        current: current.fields,
        fieldTypes: LARK_FIELD_TYPES,
      });
      if (!diff.hasChanges) {
        unchanged += 1;
        continue;
      }
      updates.push({ record_id: current.record_id, fields: diff.changes });
      for (const field of diff.changedFields) {
        changedFieldCounts.set(field, (changedFieldCounts.get(field) ?? 0) + 1);
      }
    }

    for (const [uniqueKey, current] of canonicalMap) {
      if (!desiredByKey.has(uniqueKey) && current.record_id) deleteIds.add(current.record_id);
    }

    if (!dryRun) {
      for (const batch of chunks(creates, writeBatchSize)) await larkClient.batchCreate(baseId, tableId, batch);
      for (const batch of chunks(updates, writeBatchSize)) await larkClient.batchUpdate(baseId, tableId, batch);
      for (const batch of chunks([...deleteIds], writeBatchSize)) {
        await larkClient.batchDelete(baseId, tableId, batch);
      }
    }

    const result = Object.freeze({
      tableId,
      received: transactions.length,
      records: mapped.length,
      creates: creates.length,
      updates: updates.length,
      unchanged,
      deletes: deleteIds.size,
      existing: existing.length,
      duplicates: duplicates.length,
      schema,
      dryRun: Boolean(dryRun),
      changedFieldCounts: Object.freeze(Object.fromEntries([...changedFieldCounts].sort())),
    });
    logger?.info?.({ ...result, shopId: shop.shopId }, "Unsettled transactions snapshot sync completed");
    return result;
  }

  return Object.freeze({ sync });
}
