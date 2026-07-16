import { LARK_SCHEMAS } from "../config/larkSchemas.js";

function mismatchReasons(expected, actual) {
  const reasons = [];
  const compatibleLegacySingleSelect = expected.type === 1
    && expected.ui_type === "Text"
    && actual.type === 3
    && actual.ui_type === "SingleSelect";
  const compatibleDateTimeFormatter = expected.type === 5
    && expected.ui_type === "DateTime"
    && actual.type === 5
    && actual.ui_type === "DateTime";
  if (actual.type !== expected.type && !compatibleLegacySingleSelect) {
    reasons.push(`type expected ${expected.type}, received ${actual.type}`);
  }
  if (expected.ui_type && actual.ui_type !== expected.ui_type && !compatibleLegacySingleSelect) {
    reasons.push(`ui_type expected ${expected.ui_type}, received ${actual.ui_type ?? "missing"}`);
  }
  for (const [name, value] of Object.entries(expected.property ?? {})) {
    // Lark's date_formatter controls display only. DateTime fields still read
    // and write the same millisecond timestamp for every formatter.
    if (name === "date_formatter" && compatibleDateTimeFormatter) continue;
    if (actual.property?.[name] !== value) {
      reasons.push(`property.${name} expected ${JSON.stringify(value)}, received ${JSON.stringify(actual.property?.[name])}`);
    }
  }
  return reasons;
}

function validateExistingFields({ actualFields, expectedFields, tableId, schemaType, allowMissing }) {
  const actualByName = new Map(actualFields.map((field) => [field.field_name, field]));
  const missing = [];
  const mismatches = [];
  for (const expected of expectedFields) {
    const actual = actualByName.get(expected.field_name);
    if (!actual) {
      missing.push(expected);
      continue;
    }
    const reasons = mismatchReasons(expected, actual);
    if (reasons.length > 0) mismatches.push(`${expected.field_name}: ${reasons.join(", ")}`);
  }
  if (mismatches.length > 0) {
    throw new Error(`Lark schema mismatch for ${schemaType} table ${tableId}: ${mismatches.join("; ")}`);
  }
  if (!allowMissing && missing.length > 0) {
    throw new Error(`Lark schema is still missing fields for ${schemaType} table ${tableId}: ${missing.map((field) => field.field_name).join(", ")}`);
  }
  return missing;
}

export function createLarkSchemaService({ larkClient, logger } = {}) {
  if (!larkClient?.listFields || !larkClient?.createField) {
    throw new Error("larkClient.listFields and larkClient.createField are required");
  }
  const ensured = new Map();

  async function ensureTableSchema({ baseId, tableId, schemaType, createMissing = true }) {
    const expectedFields = LARK_SCHEMAS[schemaType];
    if (!expectedFields) throw new Error(`Unknown Lark schema type: ${schemaType}`);
    const cacheKey = `${baseId}:${tableId}:${schemaType}`;
    if (ensured.has(cacheKey)) return ensured.get(cacheKey);

    const operation = (async () => {
      let actualFields = await larkClient.listFields(baseId, tableId);
      const missing = validateExistingFields({
        actualFields,
        expectedFields,
        tableId,
        schemaType,
        allowMissing: true,
      });
      if (!createMissing && missing.length > 0) {
        throw new Error(`Lark schema is missing fields for ${schemaType} table ${tableId}, but DRY_RUN prevents creating them: ${missing.map((field) => field.field_name).join(", ")}`);
      }
      const createdFields = [];
      for (const field of missing) {
        await larkClient.createField(baseId, tableId, field);
        createdFields.push(field.field_name);
        logger?.info?.({ tableId, schemaType, fieldName: field.field_name, type: field.type, uiType: field.ui_type }, "Created missing Lark field");
      }
      if (createdFields.length > 0) actualFields = await larkClient.listFields(baseId, tableId);
      validateExistingFields({
        actualFields,
        expectedFields,
        tableId,
        schemaType,
        allowMissing: false,
      });
      return Object.freeze({ schemaType, fields: expectedFields.length, createdFields: Object.freeze(createdFields) });
    })();

    ensured.set(cacheKey, operation);
    try {
      return await operation;
    } catch (error) {
      ensured.delete(cacheKey);
      throw error;
    }
  }

  return Object.freeze({ ensureTableSchema });
}
