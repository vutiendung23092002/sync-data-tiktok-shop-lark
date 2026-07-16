import "dotenv/config";

import { createLarkClient } from "../src/clients/larkClient.js";

const client = createLarkClient({ appId: process.env.LARK_APP_ID, appSecret: process.env.LARK_APP_SECRET });
const appToken = "Fg8lbmhRuaDGBwsDbcKlCCf3g6b";
const samples = {
  orders: "tblRnv8YY56TbQGY",
  orderItems: "tblYgB3iwNP13M7Z",
  finance: "tbldO66icmmaewCV",
  returnOrders: "tblnjLBEA5z2YPWi",
};

for (const [type, tableId] of Object.entries(samples)) {
  const fields = await client.listFields(appToken, tableId);
  console.info(JSON.stringify({ type, fields: fields.map(({ field_name, type: fieldType, ui_type, is_primary, property }) => ({ field_name, type: fieldType, ui_type, is_primary, property })) }, null, 2));
}
