import assert from "node:assert/strict";
import test from "node:test";

import { createReturnOrderSyncService } from "../../src/services/returnOrderSyncService.js";

test("return order service dedupes and upserts the latest source record", async () => {
  let upsertInput;
  const service = createReturnOrderSyncService({
    environment: "test",
    packingRepository: {
      findLatestByTrackingNumbers: async (trackingNumbers) => {
        assert.deepEqual(trackingNumbers, ["RETURN-TRACK-1"]);
        return new Map([["RETURN-TRACK-1", { linkDrive: "https://example.com/return-video" }]]);
      },
    },
    larkUpsertService: {
      upsert: async (input) => {
        upsertInput = input;
        return { creates: 1, updates: 0, unchanged: 0, dryRun: true, changedFieldCounts: {} };
      },
    },
  });

  const result = await service.sync({
    returnOrders: [
      { return_id: "return-1", update_time: 1, return_status: "OLD", return_tracking_number: "RETURN-TRACK-1" },
      { return_id: "return-1", update_time: 2, return_status: "NEW", return_tracking_number: "RETURN-TRACK-1" },
    ],
    shop: { shopId: "shop-1", shopName: "Shop" },
    range: { from: 1_720_000_000, to: 1_721_000_000 },
  });

  assert.equal(result.fetched, 2);
  assert.equal(result.deduped, 1);
  assert.equal(upsertInput.records[0].fields["Trạng thái trả hàng"], "NEW");
  assert.deepEqual(upsertInput.records[0].fields["Video trả hàng"], { text: "Link video trả hàng", link: "https://example.com/return-video" });
  assert.deepEqual(upsertInput.lookup, {
    type: "dateRange",
    fieldName: "Ngày tạo",
    from: 1_720_000_000,
    to: 1_721_000_000,
  });
});
