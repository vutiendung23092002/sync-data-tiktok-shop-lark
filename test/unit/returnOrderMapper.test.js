import assert from "node:assert/strict";
import test from "node:test";

import { mapReturnOrder } from "../../src/mappers/returnOrderMapper.js";

test("return order mapper emits all documented identity, status and amount fields", () => {
  const mapped = mapReturnOrder({
    order_id: "order-1",
    return_id: "return-1",
    combined_return_id: "combined-1",
    create_time: 1_720_000_000,
    update_time: 1_720_000_100,
    is_combined_return: false,
    return_status: "REQUEST_SUCCESS",
    return_tracking_number: "RETURN-TRACK-1",
    return_line_items: [{ product_name: "Product A" }, { product_name: "Product B" }],
    refund_amount: { refund_shipping_fee: "1000", refund_subtotal: "20000", refund_tax: "200", refund_total: "21200" },
    discount_amount: [{ product_platform_discount: "500", shipping_fee_seller_discount: "300" }],
    shipping_fee_amount: [{ buyer_paid_return_shipping_fee: "400", seller_paid_return_shipping_fee: "600" }],
  }, {
    shopId: "shop-1",
    shopName: "Công Ty Hân Korea",
    packing: { linkDrive: "https://example.com/return-video" },
  });

  assert.equal(mapped.uniqueKey, "return-1_shop-1");
  assert.equal(mapped.fields["Ngày tạo"], 1_720_000_000_000);
  assert.equal(mapped.fields["Trả hàng gộp"], "false");
  assert.equal(mapped.fields["Sản phẩm trả hàng"], "Product A, Product B");
  assert.equal(mapped.fields["Tổng refund"], 21200);
  assert.equal(mapped.fields["Giảm giá nền tảng (sản phẩm)"], 500);
  assert.equal(mapped.fields["Phí trả hàng người bán trả"], 600);
  assert.deepEqual(mapped.fields["Video trả hàng"], { text: "Link video trả hàng", link: "https://example.com/return-video" });
});

test("return order mapper rejects missing return_id", () => {
  assert.throws(() => mapReturnOrder({}, { shopId: "shop-1" }), /return_id/i);
});
