import "dotenv/config";

import { createLarkClient } from "../src/clients/larkClient.js";
import { buildTestTableDefinitions } from "../src/config/larkSchemas.js";
import { createLarkSchemaService } from "../src/services/larkSchemaService.js";

const TEST_BASE_ID = "Df3WbKnmyaeUKJsphablcI8Jgeh";
const client = createLarkClient({ appId: process.env.LARK_APP_ID, appSecret: process.env.LARK_APP_SECRET });
const schemaService = createLarkSchemaService({ larkClient: client, logger: console });
const existingTables = await client.listTables(TEST_BASE_ID);
const byName = new Map(existingTables.map((table) => [table.name, table]));
const mapping = { baseId: TEST_BASE_ID, orders: {}, orderItems: {}, finance: {}, returnOrders: null, skus: null };

for (const definition of buildTestTableDefinitions()) {
  let table = byName.get(definition.name);
  if (!table) {
    const created = await client.createTable(TEST_BASE_ID, {
      name: definition.name,
      default_view_name: "All records",
      fields: definition.fields,
    });
    table = { table_id: created.table_id, name: definition.name };
    byName.set(definition.name, table);
    console.error(`created ${definition.name} -> ${table.table_id}`);
  } else {
    console.error(`reused ${definition.name} -> ${table.table_id}`);
  }
  await schemaService.ensureTableSchema({ baseId: TEST_BASE_ID, tableId: table.table_id, schemaType: definition.type });
  if (definition.type === "returnOrders") mapping.returnOrders = table.table_id;
  else if (definition.type === "skus") mapping.skus = table.table_id;
  else mapping[definition.type][definition.month] = table.table_id;
}

console.info(JSON.stringify(mapping, null, 2));
