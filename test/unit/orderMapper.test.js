import assert from "node:assert/strict";
import test from "node:test";

import { mapOrder, mapOrderItem } from "../../src/mappers/orderMapper.js";

const order = {
  id: "order-1", create_time: 1_720_000_000, paid_time: 1_720_000_100,
  tracking_number: "TRACK-1", status: "PAID", update_time: 1_720_000_200,
  payment: { total_amount: "120000", sub_total: "100000", shipping_fee: "20000" },
  packages: [{ id: "package-1" }],
};

test("order mapper emits documented IDs, milliseconds, money and packing URL", () => {
  const mapped = mapOrder(order, { shopId: "shop-1", shopName: "Công Ty Hân Korea", packing: { employee: "An", linkDrive: "https://example.com/video" } });
  assert.equal(mapped.uniqueKey, "order-1_shop-1");
  assert.equal(mapped.fields["Ngày tạo đơn"], 1_720_000_000_000);
  assert.equal(mapped.fields["Tổng tiền"], 120000);
  assert.deepEqual(mapped.fields["Video đóng hàng"], { text: "Link video đóng hàng", link: "https://example.com/video" });
  assert.equal(mapped.fields["hash"], undefined);
});

test("order item mapper includes cost and protected seller SKU fields", () => {
  const mapped = mapOrderItem({ id: "item-1", sku_id: "sku-id", seller_sku: " SKU-1 ", product_name: "Product", sale_price: "90000" }, order, { shopId: "shop-1", shopName: "Shop", cost: 50000 });
  assert.equal(mapped.uniqueKey, "item-1_shop-1");
  assert.equal(mapped.fields["Mã sản phẩm"], " SKU-1 ");
  assert.equal(mapped.fields["Giá vốn"], 50000);
});
