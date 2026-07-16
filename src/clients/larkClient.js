import * as lark from "@larksuiteoapi/node-sdk";
import { randomUUID } from "node:crypto";

import { withRetry } from "../utils/retry.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function recordDate(record, fieldName) {
  const value = record.fields?.[fieldName];
  const numeric = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function createLarkClient({ appId, appSecret, logger, sdkClient } = {}) {
  if (!appId || !appSecret) throw new Error("Lark appId and appSecret are required");
  const sdk = sdkClient ?? new lark.Client({ appId, appSecret, disableTokenCache: false });

  async function call(operation, name) {
    return withRetry(async () => {
      const response = await operation();
      if (response?.code && response.code !== 0) {
        const error = new Error(`Lark ${name} failed: ${response.msg ?? "unknown error"}`);
        error.apiCode = response.code;
        error.body = response;
        throw error;
      }
      return response;
    }, {
      onRetry: ({ attempt, delayMs, error }) => logger?.warn?.({ name, attempt, delayMs, error: error.message }, "Retrying Lark API"),
    });
  }

  async function listTables(appToken) {
    const items = [];
    let pageToken;
    do {
      const response = await call(() => sdk.bitable.appTable.list({
        params: { page_size: 100, ...(pageToken ? { page_token: pageToken } : {}) },
        path: { app_token: appToken },
      }), "list tables");
      items.push(...(response.data?.items ?? []));
      pageToken = response.data?.has_more ? response.data.page_token : undefined;
    } while (pageToken);
    return items;
  }

  async function createTable(appToken, table) {
    const response = await call(() => sdk.bitable.appTable.create({
      data: { table },
      path: { app_token: appToken },
    }), `create table ${table.name}`);
    return response.data;
  }

  async function listFields(appToken, tableId) {
    const items = [];
    let pageToken;
    do {
      const response = await call(() => sdk.bitable.appTableField.list({
        params: { page_size: 100, ...(pageToken ? { page_token: pageToken } : {}) },
        path: { app_token: appToken, table_id: tableId },
      }), "list fields");
      items.push(...(response.data?.items ?? []));
      pageToken = response.data?.has_more ? response.data.page_token : undefined;
    } while (pageToken);
    return items;
  }

  async function createField(appToken, tableId, field) {
    const response = await call(() => sdk.bitable.appTableField.create({
      data: field,
      path: { app_token: appToken, table_id: tableId },
    }), `create field ${field.field_name}`);
    return response.data?.field;
  }

  async function searchRecords(appToken, tableId, { filter, fieldNames } = {}) {
    const items = [];
    let pageToken;
    do {
      const response = await call(() => sdk.bitable.appTableRecord.search({
        params: { page_size: 500, ...(pageToken ? { page_token: pageToken } : {}) },
        data: {
          automatic_fields: true,
          ...(filter ? { filter } : {}),
          ...(fieldNames?.length ? { field_names: fieldNames } : {}),
        },
        path: { app_token: appToken, table_id: tableId },
      }), "search records");
      items.push(...(response.data?.items ?? []));
      pageToken = response.data?.has_more ? response.data.page_token : undefined;
    } while (pageToken);
    return items;
  }

  async function searchByDateRange(appToken, tableId, {
    dateFieldName,
    fromMs,
    toMs,
    fieldNames,
  }) {
    if (!dateFieldName) throw new Error("dateFieldName is required");
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
      throw new Error("A valid Lark date range is required");
    }
    const records = await searchRecords(appToken, tableId, {
      fieldNames,
      filter: {
        conjunction: "and",
        conditions: [
          { field_name: dateFieldName, operator: "isGreater", value: ["ExactDate", String(fromMs - ONE_DAY_MS)] },
          { field_name: dateFieldName, operator: "isLess", value: ["ExactDate", String(toMs + ONE_DAY_MS)] },
        ],
      },
    });
    return records.filter((record) => {
      const timestamp = recordDate(record, dateFieldName);
      return timestamp != null && timestamp >= fromMs && timestamp < toMs;
    });
  }

  async function searchAllRecords(appToken, tableId, { fieldNames } = {}) {
    return searchRecords(appToken, tableId, { fieldNames });
  }

  async function batchCreate(appToken, tableId, records, clientToken = randomUUID()) {
    if (records.length === 0) return [];
    const response = await call(() => sdk.bitable.appTableRecord.batchCreate({
      params: { client_token: clientToken },
      data: { records },
      path: { app_token: appToken, table_id: tableId },
    }), "batch create records");
    return response.data?.records ?? [];
  }

  async function batchUpdate(appToken, tableId, records) {
    if (records.length === 0) return [];
    const response = await call(() => sdk.bitable.appTableRecord.batchUpdate({
      data: { records },
      path: { app_token: appToken, table_id: tableId },
    }), "batch update records");
    return response.data?.records ?? [];
  }

  return Object.freeze({
    sdk,
    call,
    listTables,
    createTable,
    listFields,
    createField,
    searchRecords,
    searchByDateRange,
    searchAllRecords,
    batchCreate,
    batchUpdate,
  });
}
