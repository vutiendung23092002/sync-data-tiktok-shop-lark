import "dotenv/config";

import { createLarkClient } from "../src/clients/larkClient.js";

function shape(value) {
  if (value == null) return String(value);
  if (Array.isArray(value)) return { array: value.length, item: value.length ? shape(value[0]) : null };
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, shape(child)]));
  return typeof value;
}

const client = createLarkClient({ appId: process.env.LARK_APP_ID, appSecret: process.env.LARK_APP_SECRET });
for (const tableId of ["tblkupL9uPIsiJ9O", "tblJbG2jeSeKHcnu", "tblSu9mTdLHf6CRI"]) {
  const response = await client.call(() => client.sdk.bitable.appTableRecord.search({
    params: { page_size: 1 }, data: { automatic_fields: true },
    path: { app_token: "Df3WbKnmyaeUKJsphablcI8Jgeh", table_id: tableId },
  }), "inspect record shape");
  const record = response.data?.items?.[0];
  console.info(JSON.stringify({ tableId, fields: Object.fromEntries(Object.entries(record?.fields ?? {}).map(([name, value]) => [name, shape(value)])) }, null, 2));
}
