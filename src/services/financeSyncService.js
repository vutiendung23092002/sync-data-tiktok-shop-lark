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

function statementIsInRange(statement, range) {
  const statementTime = Number(statement?.statement_time);
  return Number.isFinite(statementTime)
    && statementTime >= range.from
    && statementTime < range.to;
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

function buildLookup(group, statementFilter) {
  const statementTimes = group.records.map((record) => Number(record.statementTime));
  return {
    type: "dateRange",
    fieldName: "Ngày quyết toán",
    from: Math.min(statementFilter.from, ...statementTimes),
    to: Math.max(statementFilter.to, ...statementTimes.map((value) => value + 1)),
  };
}

export function createFinanceSyncService({ environment, larkUpsertService, logger } = {}) {
  if (!larkUpsertService) throw new Error("larkUpsertService is required");

  async function sync({ statements, shop, fetchTransactions, range, statementRange = range }) {
    if (typeof fetchTransactions !== "function") throw new Error("fetchTransactions is required");
    if (!range) throw new Error("range is required");
    if (!statementRange || !Number.isFinite(statementRange.filterFrom ?? statementRange.from)
      || !Number.isFinite(statementRange.filterTo ?? statementRange.to)) {
      throw new Error("A valid Finance statement range is required");
    }
    const statementFilter = {
      from: statementRange.filterFrom ?? statementRange.from,
      to: statementRange.filterTo ?? statementRange.to,
    };
    if (statementFilter.from >= statementFilter.to) throw new Error("A valid Finance statement range is required");

    const dedupedStatements = dedupeMappedRecords(statements, {
      keySelector: (statement) => statement.id,
      timestampSelector: (statement) => Number(statement.statement_time ?? statement.create_time ?? 0),
    });
    const sourceStatements = dedupedStatements.filter((statement) => statementIsInRange(statement, statementFilter));
    const outOfRangeStatements = dedupedStatements.length - sourceStatements.length;
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
      if (!Number.isFinite(Number(mapped.statementTime))) {
        throw new Error(`Finance transaction ${mapped.uniqueKey} is missing statement_time`);
      }
      const table = getLarkTableConfig({ environment, type: "finance", month: getVietnamMonth(mapped.statementTime) });
      return { ...table, mapped };
    });
    const tables = [];
    for (const group of groupByTable(records)) {
      const lookup = buildLookup(group, statementFilter);
      tables.push({ type: "finance", tableId: group.tableId, ...await larkUpsertService.upsert({ ...group, lookup, schemaType: "finance" }) });
    }

    return Object.freeze({
      fetchedStatements: statements.length,
      dedupedStatements: dedupedStatements.length,
      inRangeStatements: sourceStatements.length,
      outOfRangeStatements,
      eligibleStatements: eligibleStatements.length,
      skippedUnsettled,
      transactions: uniqueTransactions.length,
      tables: Object.freeze(tables),
    });
  }

  return Object.freeze({ sync });
}
