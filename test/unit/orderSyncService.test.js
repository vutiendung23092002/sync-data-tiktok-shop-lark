import assert from "node:assert/strict";
import test from "node:test";

import { getLarkTableConfig } from "../../src/config/larkTableMapping.js";
import { createOrderSyncService } from "../../src/services/orderSyncService.js";

function order({ id, createTime, updateTime, trackingNumber, status, item }) {
  return {
    id,
    create_time: createTime,
    update_time: updateTime,
    tracking_number: trackingNumber,
    status,
    line_items: item ? [item] : [],
  };
}

test("order service dedupes, groups monthly tables and orchestrates Orders, Items and SKUS", async () => {
  const januaryTime = Date.parse("2026-01-31T16:59:59Z") / 1000;
  const februaryTime = Date.parse("2026-01-31T17:00:00Z") / 1000;
  const januaryItem = {
    id: "item-jan",
    sku_id: "sku-jan",
    seller_sku: " SKU-JAN ",
    sku_name: "January SKU",
    product_id: "product-jan",
    product_name: "January product",
  };
  const februaryItem = {
    id: "item-feb",
    sku_id: "sku-feb",
    seller_sku: "SKU-FEB",
    sku_name: "February SKU",
    product_id: "product-feb",
    product_name: "February product",
  };
  const packingInputs = [];
  const costInputs = [];
  const upserts = [];
  const service = createOrderSyncService({
    environment: "test",
    packingRepository: {
      findLatestByTrackingNumbers: async (values) => {
        packingInputs.push(values);
        return new Map([["TRACK-JAN", { employee: "An", linkDrive: "https://example.com/jan" }]]);
      },
    },
    productCostRepository: {
      findLatestBySellerSkus: async (values) => {
        costInputs.push(values);
        return new Map([["sku-jan", 111], ["sku-feb", 222]]);
      },
    },
    larkUpsertService: {
      upsert: async (input) => {
        upserts.push(input);
        return { creates: input.records.length, updates: 0, unchanged: 0 };
      },
    },
  });
  const range = { from: januaryTime - 60, to: februaryTime + 60 };

  const result = await service.sync({
    orders: [
      order({ id: "order-jan", createTime: januaryTime, updateTime: 1, trackingNumber: "TRACK-OLD", status: "OLD", item: januaryItem }),
      order({ id: "order-jan", createTime: januaryTime, updateTime: 2, trackingNumber: "TRACK-JAN", status: "NEW", item: januaryItem }),
      order({ id: "order-feb", createTime: februaryTime, updateTime: 1, trackingNumber: "TRACK-FEB", status: "PAID", item: februaryItem }),
    ],
    shop: { shopId: "shop-1", shopName: "Shop" },
    range,
  });

  assert.equal(result.fetched, 3);
  assert.equal(result.deduped, 2);
  assert.deepEqual(packingInputs, [["TRACK-JAN", "TRACK-FEB"]]);
  assert.deepEqual(costInputs, [[" SKU-JAN ", "SKU-FEB"]]);
  assert.equal(upserts.length, 5);

  const januaryOrders = upserts.find((input) => input.schemaType === "orders" && input.tableId === getLarkTableConfig({ environment: "test", type: "orders", month: 1 }).tableId);
  const februaryOrders = upserts.find((input) => input.schemaType === "orders" && input.tableId === getLarkTableConfig({ environment: "test", type: "orders", month: 2 }).tableId);
  const januaryItems = upserts.find((input) => input.schemaType === "orderItems" && input.tableId === getLarkTableConfig({ environment: "test", type: "orderItems", month: 1 }).tableId);
  const februaryItems = upserts.find((input) => input.schemaType === "orderItems" && input.tableId === getLarkTableConfig({ environment: "test", type: "orderItems", month: 2 }).tableId);
  const skus = upserts.find((input) => input.schemaType === "skus");

  assert.equal(januaryOrders.records[0].fields["Trạng thái"], "NEW");
  assert.deepEqual(januaryOrders.records[0].fields["Video đóng hàng"], { text: "Link video đóng hàng", link: "https://example.com/jan" });
  assert.equal(februaryOrders.records[0].fields["Trạng thái"], "PAID");
  assert.deepEqual(januaryOrders.lookup, { type: "dateRange", fieldName: "Ngày tạo đơn", ...range });
  assert.deepEqual(februaryOrders.lookup, { type: "dateRange", fieldName: "Ngày tạo đơn", ...range });
  assert.equal(januaryItems.records[0].fields["Giá vốn"], 111);
  assert.equal(februaryItems.records[0].fields["Giá vốn"], 222);
  assert.deepEqual(januaryItems.protectedFields, ["Giá vốn", "Mã sản phẩm"]);
  assert.deepEqual(februaryItems.protectedFields, ["Giá vốn", "Mã sản phẩm"]);
  assert.deepEqual(skus.lookup, { type: "all" });
  assert.equal(skus.uniqueFieldName, "id_sku");
  assert.deepEqual(skus.records.map((record) => record.uniqueKey), ["sku-jan", "sku-feb"]);
});

test("order service validates dependencies and requires a sync range", async () => {
  assert.throws(() => createOrderSyncService(), /are required/);
  const service = createOrderSyncService({
    productCostRepository: {},
    packingRepository: {},
    larkUpsertService: {},
  });
  await assert.rejects(service.sync({ orders: [], shop: {} }), /range is required/);
});
