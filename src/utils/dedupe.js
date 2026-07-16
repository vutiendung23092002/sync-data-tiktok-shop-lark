function timestamp(value) {
  if (value == null || value === "") return Number.NEGATIVE_INFINITY;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

export function dedupeMappedRecords(
  records,
  {
    keySelector = (record) => record?.uniqueKey,
    timestampSelector = (record) => Math.max(timestamp(record?.rawUpdatedAt), timestamp(record?.rawInsertedAt)),
  } = {},
) {
  const unique = new Map();
  records.forEach((record, index) => {
    const key = keySelector(record);
    if (key == null || key === "") throw new Error(`Record at index ${index} is missing its dedupe key`);
    const existing = unique.get(String(key));
    if (!existing || timestampSelector(record) >= timestampSelector(existing)) unique.set(String(key), record);
  });
  return [...unique.values()];
}

export function buildLarkUniqueIndex(records, keySelector) {
  const canonicalMap = new Map();
  const duplicates = [];
  for (const record of records) {
    const key = keySelector(record);
    if (key == null || key === "") continue;
    const normalizedKey = String(key);
    const existing = canonicalMap.get(normalizedKey);
    if (!existing) {
      canonicalMap.set(normalizedKey, record);
      continue;
    }
    if (timestamp(record.created_time) >= timestamp(existing.created_time)) {
      duplicates.push(existing);
      canonicalMap.set(normalizedKey, record);
    } else {
      duplicates.push(record);
    }
  }
  return Object.freeze({ canonicalMap, duplicates: Object.freeze(duplicates) });
}
