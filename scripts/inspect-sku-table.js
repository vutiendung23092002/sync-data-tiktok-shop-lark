import "dotenv/config";

import { createLarkClient } from "../src/clients/larkClient.js";

const client = createLarkClient({ appId: process.env.LARK_APP_ID, appSecret: process.env.LARK_APP_SECRET });
const fields = await client.listFields("Fg8lbmhRuaDGBwsDbcKlCCf3g6b", "tblLQJtTQeHekkcm");
console.info(JSON.stringify(fields.map(({ field_name, type, ui_type, is_primary }) => ({ field_name, type, ui_type, is_primary })), null, 2));
