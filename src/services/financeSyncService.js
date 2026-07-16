import { getLarkTableConfig } from "../config/larkTableMapping.js";
import { mapFinanceTransaction } from "../mappers/financeMapper.js";
import { dedupeMappedRecords } from "../utils/dedupe.js";
import { getVietnamMonth } from "../utils/vietnamTime.js";

function normalizedStatus(value) {
  return String(value ?? "").trim().toUpperCase();
}

function eligibleStatementStatus(statement) {
  const status = normalizedStatus(statement.payment_status);
  return status === "SETTLED" || status === "PAID";
}

function transactionResponseIsSettled(statement, response) {
  const responseStatus = normalizedStatus(response.status);
  if (responseStatus) return responseStatus === "SETTLED";
  return normalizedStatus(statement.payment_status) === "SETTLED";
}

function groupByTable(records) {
  const groups = new Map();
  for (const record of records) {
    const key = `${record.baseId}:${record.tableId}`;
    if (!groups.has(key)) groups.set(key, { baseId: record.baseId, tableId: record.tableId, records: [] });
    groups.get(key).records.push(record.mapped);
  }
  return [...groups.values()];
}

export function createFinanceSyncService({ environment, larkUpsertService, logger } = {}) {
  if (!larkUpsertService) throw new Error("larkUpsertService is required");

  async function sync({ statements, shop, fetchTransactions, range }) {
    if (typeof fetchTransactions !== "function") throw new Error("fetchTransactions is required");
    if (!range) throw new Error("range is required");
    const sourceStatements = dedupeMappedRecords(statements, {
      keySelector: (statement) => statement.id,
      timestampSelector: (statement) => Number(statement.statement_time ?? statement.create_time ?? 0),
    });
    const eligibleStatements = sourceStatements.filter(eligibleStatementStatus);
    const mappedTransactions = [];
    let skippedUnsettled = sourceStatements.length - eligibleStatements.length;

    for (const statement of eligibleStatements) {
      const response = await fetchTransactions(statement);
      if (!transactionResponseIsSettled(statement, response)) {
        skippedUnsettled += 1;
        logger?.info?.({ statementId: statement.id, paymentStatus: statement.payment_status, transactionStatus: response.status }, "Skipping unsettled finance statement");
        continue;
      }
      for (const transaction of response.transactions ?? []) {
        mappedTransactions.push(mapFinanceTransaction(transaction, { statement, shopId: shop.shopId, shopName: shop.shopName }));
      }
    }

    const uniqueTransactions = dedupeMappedRecords(mappedTransactions);
    const records = uniqueTransactions.map((mapped) => {
      if (mapped.statementTime == null) throw new Error(`Finance transaction ${mapped.uniqueKey} is missing statement_time`);
      const table = getLarkTableConfig({ environment, type: "finance", month: getVietnamMonth(mapped.statementTime) });
      return { ...table, mapped };
    });
    const tables = [];
    const lookup = { type: "dateRange", fieldName: "Ngày quyết toán", from: range.from, to: range.to };
    for (const group of groupByTable(records)) {
      tables.push({ type: "finance", tableId: group.tableId, ...await larkUpsertService.upsert({ ...group, lookup, schemaType: "finance" }) });
    }

    return Object.freeze({
      fetchedStatements: statements.length,
      dedupedStatements: sourceStatements.length,
      eligibleStatements: eligibleStatements.length,
      skippedUnsettled,
      transactions: uniqueTransactions.length,
      tables: Object.freeze(tables),
    });
  }

  return Object.freeze({ sync });
}
