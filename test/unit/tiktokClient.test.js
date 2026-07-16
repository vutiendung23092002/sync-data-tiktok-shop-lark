import assert from "node:assert/strict";
import test from "node:test";

import { createTikTokClient } from "../../src/clients/tiktokClient.js";

function response(data) {
  return { ok: true, status: 200, json: async () => ({ code: 0, data }) };
}

test("TikTok Orders client uses create-time filters for scheduled recovery sync", async () => {
  let requestBody;
  const client = createTikTokClient({
    appKey: "key",
    appSecret: "secret",
    tokenProvider: { getAccessToken: async () => "token" },
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return response({ orders: [] });
    },
  });
  await client.searchOrders({ shopCipher: "cipher", createTimeGe: 100, createTimeLt: 200 });
  assert.deepEqual(requestBody, { create_time_ge: 100, create_time_lt: 200 });
});

test("TikTok finance client paginates current statements and transactions endpoints", async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(new URL(url));
    const parsed = new URL(url);
    if (parsed.pathname === "/finance/202309/statements") {
      return parsed.searchParams.has("page_token")
        ? response({ statements: [{ id: "s2" }] })
        : response({ statements: [{ id: "s1" }], next_page_token: "statements-page-2" });
    }
    return parsed.searchParams.has("page_token")
      ? response({ status: "SETTLED", transactions: [{ id: "t2" }] })
      : response({ status: "SETTLED", create_time: 123, transactions: [{ id: "t1" }], next_page_token: "transactions-page-2" });
  };
  const client = createTikTokClient({
    appKey: "key", appSecret: "secret", tokenProvider: { getAccessToken: async () => "token" }, fetchImpl,
  });

  const statements = await client.getStatements({ shopCipher: "cipher", statementTimeGe: 1, statementTimeLt: 2 });
  const transactions = await client.getStatementTransactions({ shopCipher: "cipher", statementId: "statement/id" });

  assert.deepEqual(statements.map((item) => item.id), ["s1", "s2"]);
  assert.deepEqual(transactions.transactions.map((item) => item.id), ["t1", "t2"]);
  assert.equal(transactions.status, "SETTLED");
  assert.equal(urls[0].searchParams.has("payment_status"), false);
  assert.equal(urls[0].searchParams.get("sort_field"), "statement_time");
  assert.equal(urls[2].pathname, "/finance/202501/statements/statement%2Fid/statement_transactions");
});

test("TikTok Returns client paginates v202309 by create-time range", async () => {
  const requests = [];
  const client = createTikTokClient({
    appKey: "key",
    appSecret: "secret",
    tokenProvider: { getAccessToken: async () => "token" },
    fetchImpl: async (url, options) => {
      const parsed = new URL(url);
      requests.push({ url: parsed, body: JSON.parse(options.body) });
      return parsed.searchParams.has("page_token")
        ? response({ return_orders: [{ return_id: "r2" }] })
        : response({ return_orders: [{ return_id: "r1" }], next_page_token: "page-2" });
    },
  });

  const returns = await client.searchReturns({ shopCipher: "cipher", createTimeGe: 100, createTimeLt: 200 });
  assert.deepEqual(returns.map((item) => item.return_id), ["r1", "r2"]);
  assert.equal(requests[0].url.pathname, "/return_refund/202309/returns/search");
  assert.equal(requests[0].url.searchParams.get("page_size"), "50");
  assert.deepEqual(requests[0].body, { create_time_ge: 100, create_time_lt: 200 });
});
