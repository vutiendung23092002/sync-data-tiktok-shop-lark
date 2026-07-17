import { createHmac } from "node:crypto";

import { fetchWithRetry, HttpError } from "../utils/retry.js";

const API_BASE_URL = "https://open-api.tiktokglobalshop.com";

export function signTikTokRequest({ path, params, body, appSecret }) {
  const canonicalParams = Object.entries(params)
    .filter(([key]) => key !== "sign" && key !== "access_token")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}${value}`)
    .join("");
  const payload = `${appSecret}${path}${canonicalParams}${body == null ? "" : JSON.stringify(body)}${appSecret}`;
  return createHmac("sha256", appSecret).update(payload).digest("hex");
}

export function createTikTokClient({ appKey, appSecret, tokenProvider, fetchImpl = globalThis.fetch, logger } = {}) {
  if (!appKey || !appSecret || !tokenProvider) throw new Error("TikTok app credentials and tokenProvider are required");

  async function request(path, { method = "GET", params = {}, body, refreshed = false } = {}) {
    const token = await tokenProvider.getAccessToken();
    const signedParams = { app_key: appKey, timestamp: Math.floor(Date.now() / 1000), ...params };
    signedParams.sign = signTikTokRequest({ path, params: signedParams, body, appSecret });
    const url = new URL(path, API_BASE_URL);
    for (const [key, value] of Object.entries(signedParams)) if (value != null) url.searchParams.set(key, String(value));
    const response = await fetchWithRetry(url, {
      method,
      headers: { "content-type": "application/json", "x-tts-access-token": token },
      ...(body == null ? {} : { body: JSON.stringify(body) }),
    }, { fetchImpl, operation: `TikTok ${path}`, onRetry: ({ attempt, delayMs, error }) => logger?.warn?.({ path, attempt, delayMs, error: error.message }, "Retrying TikTok API") });
    const payload = await response.json();
    if (payload.code === 0) return payload.data ?? {};
    if (!refreshed && tokenProvider.isExpiredResponse?.(payload)) {
      await tokenProvider.refresh();
      return request(path, { method, params, body, refreshed: true });
    }
    const error = new HttpError(`TikTok ${path} failed: ${payload.message ?? payload.code}`, { body: payload });
    error.apiCode = payload.code;
    throw error;
  }

  async function searchOrders({ shopCipher, createTimeGe, createTimeLt, pageSize = 100 }) {
    if (createTimeGe == null || createTimeLt == null) throw new Error("Both createTimeGe and createTimeLt are required");
    const orders = [];
    const seenPageTokens = new Set();
    let pageToken;
    do {
      const data = await request("/order/202309/orders/search", {
        method: "POST",
        params: { shop_cipher: shopCipher, page_size: pageSize, ...(pageToken ? { page_token: pageToken } : {}) },
        body: { create_time_ge: createTimeGe, create_time_lt: createTimeLt },
      });
      orders.push(...(data.orders ?? []));
      const nextPageToken = data.next_page_token || undefined;
      if (nextPageToken && seenPageTokens.has(nextPageToken)) throw new Error("TikTok orders pagination returned a repeated page token");
      if (nextPageToken) seenPageTokens.add(nextPageToken);
      pageToken = nextPageToken;
    } while (pageToken);
    return orders;
  }

  async function getStatements({ shopCipher, statementTimeGe, statementTimeLt, paymentStatus, pageSize = 100 }) {
    const statements = [];
    const seenPageTokens = new Set();
    let pageToken;
    do {
      const data = await request("/finance/202309/statements", {
        params: {
          shop_cipher: shopCipher,
          statement_time_ge: statementTimeGe,
          statement_time_lt: statementTimeLt,
          ...(paymentStatus ? { payment_status: paymentStatus } : {}),
          sort_field: "statement_time",
          sort_order: "ASC",
          page_size: pageSize,
          ...(pageToken ? { page_token: pageToken } : {}),
        },
      });
      statements.push(...(data.statements ?? []));
      const nextPageToken = data.next_page_token || undefined;
      if (nextPageToken && seenPageTokens.has(nextPageToken)) throw new Error("TikTok statements pagination returned a repeated page token");
      if (nextPageToken) seenPageTokens.add(nextPageToken);
      pageToken = nextPageToken;
    } while (pageToken);
    return statements;
  }

  async function getStatementTransactions({ shopCipher, statementId, pageSize = 100 }) {
    const transactions = [];
    const seenPageTokens = new Set();
    let statementStatus;
    let statementCreateTime;
    let pageToken;
    do {
      const data = await request(`/finance/202501/statements/${encodeURIComponent(statementId)}/statement_transactions`, {
        params: {
          shop_cipher: shopCipher,
          sort_field: "order_create_time",
          sort_order: "ASC",
          page_size: pageSize,
          ...(pageToken ? { page_token: pageToken } : {}),
        },
      });
      statementStatus ??= data.status;
      statementCreateTime ??= data.create_time;
      transactions.push(...(data.transactions ?? []));
      const nextPageToken = data.next_page_token || undefined;
      if (nextPageToken && seenPageTokens.has(nextPageToken)) throw new Error("TikTok statement transactions pagination returned a repeated page token");
      if (nextPageToken) seenPageTokens.add(nextPageToken);
      pageToken = nextPageToken;
    } while (pageToken);
    return Object.freeze({ status: statementStatus, createTime: statementCreateTime, transactions: Object.freeze(transactions) });
  }

  async function getUnsettledTransactions({ shopCipher, pageSize = 100 }) {
    const transactions = [];
    const seenPageTokens = new Set();
    let totals;
    let pageToken;
    do {
      const data = await request("/finance/202507/orders/unsettled", {
        params: {
          shop_cipher: shopCipher,
          sort_field: "order_create_time",
          sort_order: "ASC",
          page_size: pageSize,
          ...(pageToken ? { page_token: pageToken } : {}),
        },
      });
      // The unsettled set can change while pages are being read. Keep the
      // newest total so callers validate against the state seen on the last page.
      totals = Object.freeze({
        totalCount: Number(data.total_count ?? totals?.totalCount ?? 0),
        estimatedSettlementAmount: data.sum_est_settlement_amount ?? totals?.estimatedSettlementAmount ?? null,
        estimatedRevenueAmount: data.sum_est_revenue_amount ?? totals?.estimatedRevenueAmount ?? null,
        estimatedAdjustmentAmount: data.sum_est_adjustment_amount ?? totals?.estimatedAdjustmentAmount ?? null,
        estimatedFeeAmount: data.sum_est_fee_amount ?? totals?.estimatedFeeAmount ?? null,
      });
      transactions.push(...(data.transactions ?? []));
      const nextPageToken = data.next_page_token || undefined;
      if (nextPageToken && seenPageTokens.has(nextPageToken)) {
        throw new Error("TikTok unsettled transactions pagination returned a repeated page token");
      }
      if (nextPageToken) seenPageTokens.add(nextPageToken);
      pageToken = nextPageToken;
    } while (pageToken);
    return Object.freeze({
      totals: totals ?? Object.freeze({
        totalCount: 0,
        estimatedSettlementAmount: null,
        estimatedRevenueAmount: null,
        estimatedAdjustmentAmount: null,
        estimatedFeeAmount: null,
      }),
      transactions: Object.freeze(transactions),
    });
  }

  async function searchReturns({ shopCipher, createTimeGe, createTimeLt, pageSize = 50 }) {
    if (createTimeGe == null || createTimeLt == null) throw new Error("Both createTimeGe and createTimeLt are required");
    const returnOrders = [];
    const seenPageTokens = new Set();
    let pageToken;
    do {
      const data = await request("/return_refund/202309/returns/search", {
        method: "POST",
        params: {
          shop_cipher: shopCipher,
          sort_field: "create_time",
          sort_order: "ASC",
          page_size: pageSize,
          ...(pageToken ? { page_token: pageToken } : {}),
        },
        body: { create_time_ge: createTimeGe, create_time_lt: createTimeLt },
      });
      returnOrders.push(...(data.return_orders ?? []));
      const nextPageToken = data.next_page_token || undefined;
      if (nextPageToken && seenPageTokens.has(nextPageToken)) throw new Error("TikTok returns pagination returned a repeated page token");
      if (nextPageToken) seenPageTokens.add(nextPageToken);
      pageToken = nextPageToken;
    } while (pageToken);
    return returnOrders;
  }

  return Object.freeze({
    request,
    searchOrders,
    getStatements,
    getStatementTransactions,
    getUnsettledTransactions,
    searchReturns,
  });
}
