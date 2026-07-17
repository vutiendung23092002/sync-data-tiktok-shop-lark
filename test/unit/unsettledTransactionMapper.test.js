import assert from "node:assert/strict";
import test from "node:test";

import { mapUnsettledTransaction } from "../../src/mappers/unsettledTransactionMapper.js";

test("unsettled mapper keeps settled finance names and adds snapshot metadata", () => {
  const mapped = mapUnsettledTransaction({
    id: "tx-1",
    order_id: "order-1",
    order_create_time: 1_720_000_000,
    type: "ORDER",
    status: "UNSETTLED",
    unsettled_reason: "WAITING_FOR_PACKAGE_DELIVERY",
    estimated_settlement: "Delivered + 1 days",
    est_revenue_amount: "100000",
    est_settlement_amount: "78000",
    est_fee_tax_amount: "-12000",
    est_shipping_cost_amount: "-10000",
    revenue_breakdown: {
      subtotal_before_discount_amount: "100000",
    },
    fee_tax_breakdown: {
      fee: {
        affiliate_commission_before_pit_amount: "-5000",
        platform_commission_amount: "-8000",
      },
      tax: { vat_amount: "-1000" },
    },
    shipping_cost_breakdown: {
      actual_shipping_fee_amount: "-9000",
      customer_paid_shipping_fee_amount: "15000",
    },
  }, { shopId: "shop-1", shopName: "Shop" });

  assert.equal(mapped.uniqueKey, "tx-1_shop-1");
  assert.equal(mapped.fields["Ngày tạo đơn"], 1_720_000_000_000);
  assert.equal(mapped.fields["Thực thu (Net)"], 78000);
  assert.equal(mapped.fields["Tổng phí & thuế"], -12000);
  assert.equal(mapped.fields["Hoa hồng Affiliate (trước PIT)"], -5000);
  assert.equal(mapped.fields["Trạng thái"], "UNSETTLED");
  assert.equal(mapped.fields["Dự kiến quyết toán"], "Delivered + 1 days");
  assert.equal(mapped.fields["Phí vận chuyển khách trả"], 15000);
});

test("unsettled mapper rejects transactions without an id", () => {
  assert.throws(() => mapUnsettledTransaction({}, { shopId: "shop-1" }), /transaction id/i);
});
