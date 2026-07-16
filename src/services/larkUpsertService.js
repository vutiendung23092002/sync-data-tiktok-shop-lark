import { buildLarkUniqueIndex } from "../utils/dedupe.js";
import { diffFields } from "../utils/diff.js";
import { normalizeLarkValue } from "../utils/normalize.js";
import { LARK_FIELD_TYPES } from "../config/larkSchemas.js";
import { createLarkSchemaService } from "./larkSchemaService.js";

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export function createLarkUpsertService({ larkClient, dryRun, batchSize = 500, logger, schemaService } = {}) {
  if (!larkClient) throw new Error("larkClient is required");
  const tableSchemaService = schemaService ?? createLarkSchemaService({ larkClient, logger });
  async function upsert({
    baseId,
    tableId,
    records,
    protectedFields = [],
    uniqueFieldName = "ID định danh (TTS)",
    lookup,
    schemaType,
  }) {
    if (!schemaType) throw new Error(`schemaType is required for table ${tableId}`);
    const schema = await tableSchemaService.ensureTableSchema({ baseId, tableId, schemaType, createMissing: !dryRun });
    const creates = [];
    const updates = [];
    let unchanged = 0;
    const changedFieldCounts = new Map();
    const fieldNames = [...new Set([
      uniqueFieldName,
      ...(lookup?.type === "dateRange" ? [lookup.fieldName] : []),
      ...records.flatMap((record) => Object.keys(record.fields ?? {})),
    ])];
    let existingRecords = [];
    if (records.length > 0 && lookup?.type === "dateRange") {
      existingRecords = await larkClient.searchByDateRange(baseId, tableId, {
        dateFieldName: lookup.fieldName,
        fromMs: lookup.from * 1000,
        toMs: lookup.to * 1000,
        fieldNames,
      });
    } else if (records.length > 0 && lookup?.type === "all") {
      existingRecords = await larkClient.searchAllRecords(baseId, tableId, { fieldNames });
    } else if (records.length > 0) {
      throw new Error(`Lark lookup strategy is required for table ${tableId}`);
    }
    const { canonicalMap, duplicates } = buildLarkUniqueIndex(
      existingRecords,
      (record) => normalizeLarkValue(record.fields?.[uniqueFieldName], "text"),
    );
    if (duplicates.length > 0) logger?.warn?.({ tableId, duplicateRecordIds: duplicates.map((item) => item.record_id) }, "Duplicate Lark records found");
    for (const record of records) {
      const canonical = canonicalMap.get(record.uniqueKey);
      if (!canonical) {
        creates.push({ fields: record.fields });
        continue;
      }
      const diff = diffFields({ desired: record.fields, current: canonical.fields, fieldTypes: LARK_FIELD_TYPES, protectedFields });
      if (!diff.hasChanges) unchanged += 1;
      else {
        updates.push({ record_id: canonical.record_id, fields: diff.changes });
        for (const field of diff.changedFields) changedFieldCounts.set(field, (changedFieldCounts.get(field) ?? 0) + 1);
      }
    }
    if (!dryRun) {
      for (const batch of chunks(creates, batchSize)) await larkClient.batchCreate(baseId, tableId, batch);
      for (const batch of chunks(updates, batchSize)) await larkClient.batchUpdate(baseId, tableId, batch);
    }
    return Object.freeze({
      creates: creates.length,
      updates: updates.length,
      unchanged,
      existing: existingRecords.length,
      schema,
      dryRun: Boolean(dryRun),
      changedFieldCounts: Object.freeze(Object.fromEntries([...changedFieldCounts].sort())),
    });
  }
  return Object.freeze({ upsert });
}
