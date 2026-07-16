import assert from "node:assert/strict";
import test from "node:test";

import { mapFinanceTransaction } from "../../src/mappers/financeMapper.js";

test("finance mapper emits documented identity, dates, totals and nested breakdown fields", () => {
  const mapped = mapFinanceTransaction({
    id: "tx-1",
    order_id: "order-1",
    order_create_time: 1_720_000_000,
    revenue_amount: "100000",
    settlement_amount: { value: "78000" },
    fee_tax_amount: "-12000",
    shipping_cost_amount: "-10000",
    supplementary_component: { customer_payment_amount: "100000" },
    revenue_breakdown: { seller_discount_amount: "5000" },
    fee_tax_breakdown: { fee: { platform_commission_amount: "-8000" }, tax: { vat_amount: "-1000" } },
    shipping_cost_breakdown: { supplementary_component: { platform_shipping_fee_discount_amount: "3000" } },
  }, {
    statement: { id: "statement-1", statement_time: 1_720_100_000 },
    shopId: "shop-1",
    shopName: "Công Ty Hân Korea",
  });

  assert.equal(mapped.uniqueKey, "tx-1_shop-1");
  assert.equal(mapped.fields["Ngày tạo đơn"], 1_720_000_000_000);
  assert.equal(mapped.fields["Ngày quyết toán"], 1_720_100_000_000);
  assert.equal(mapped.fields["Mã statemen"], "statement-1");
  assert.equal(Object.hasOwn(mapped.fields, "Tổng phí"), false);
  assert.equal(mapped.fields["Khách hàng thanh toán"], 100000);
  assert.equal(mapped.fields["Phí nền tảng (Platform Commission)"], -8000);
  assert.equal(mapped.fields["Thuế VAT"], -1000);
  assert.equal(mapped.fields["Giảm phí vận chuyển từ nền tảng"], 3000);
});

test("finance mapper uses adjustment order id and rejects transactions without id", () => {
  const mapped = mapFinanceTransaction({ id: "tx-2", adjustment_order_id: "adjusted-order" }, {
    statement: { id: "statement-2", statement_time: 1_720_100_000 }, shopId: "shop-1",
  });
  assert.equal(mapped.fields["Mã đơn hàng"], "adjusted-order");
  assert.throws(() => mapFinanceTransaction({}, { shopId: "shop-1" }), /transaction id/i);
});
