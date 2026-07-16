import "dotenv/config";

import { createLarkClient } from "../src/clients/larkClient.js";

const appId = process.env.LARK_APP_ID;
const appSecret = process.env.LARK_APP_SECRET;
if (!appId || !appSecret) throw new Error("LARK_APP_ID and LARK_APP_SECRET are required");

const client = createLarkClient({ appId, appSecret });
const bases = {
  production: "Fg8lbmhRuaDGBwsDbcKlCCf3g6b",
  test: "Df3WbKnmyaeUKJsphablcI8Jgeh",
};

for (const [environment, appToken] of Object.entries(bases)) {
  const tables = await client.listTables(appToken);
  console.info(JSON.stringify({
    environment,
    accessible: true,
    tableCount: tables.length,
    tables: tables.map(({ table_id: tableId, name }) => ({ tableId, name })),
  }, null, 2));
}
