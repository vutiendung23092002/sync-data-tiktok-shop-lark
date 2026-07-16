import assert from "node:assert/strict";
import test from "node:test";

import { createLarkClient } from "../../src/clients/larkClient.js";

test("Lark date-range search uses ExactDate filters, page size 500 and exact local boundaries", async () => {
  let request;
  const fromMs = 1_720_000_000_000;
  const toMs = 1_721_000_000_000;
  const sdkClient = {
    bitable: {
      appTableRecord: {
        search: async (input) => {
          request = input;
          return {
            code: 0,
            data: {
              has_more: false,
              items: [
                { record_id: "before", fields: { created: fromMs - 1 } },
                { record_id: "from", fields: { created: fromMs } },
                { record_id: "inside", fields: { created: toMs - 1 } },
                { record_id: "to", fields: { created: toMs } },
              ],
            },
          };
        },
      },
    },
  };
  const client = createLarkClient({ appId: "app", appSecret: "secret", sdkClient });
  const records = await client.searchByDateRange("base", "table", {
    dateFieldName: "created",
    fromMs,
    toMs,
    fieldNames: ["id", "created"],
  });

  assert.equal(request.params.page_size, 500);
  assert.deepEqual(request.data.filter.conditions, [
    { field_name: "created", operator: "isGreater", value: ["ExactDate", String(fromMs - 86_400_000)] },
    { field_name: "created", operator: "isLess", value: ["ExactDate", String(toMs + 86_400_000)] },
  ]);
  assert.deepEqual(records.map((record) => record.record_id), ["from", "inside"]);
});
