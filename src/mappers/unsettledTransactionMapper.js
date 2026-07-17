function number(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value?.value ?? value);
  return Number.isFinite(parsed) ? parsed : null;
}

function datetime(value) {
  if (value == null || value === "" || Number(value) === 0) return null;
  const parsed = Number(value);
  return Math.abs(parsed) < 1e12 ? parsed * 1000 : parsed;
}

function compact(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null && value !== undefined));
}

export function mapUnsettledTransaction(transaction, { shopId, shopName } = {}) {
  if (!transaction?.id) throw new Error("Unsettled transaction id is required");

  const revenue = transaction.revenue_breakdown ?? {};
  const fee = transaction.fee_tax_breakdown?.fee ?? {};
  const tax = transaction.fee_tax_breakdown?.tax ?? {};
  const shipping = transaction.shipping_cost_breakdown ?? {};
  const shippingSupplementary = shipping.supplementary_component ?? {};
  const uniqueKey = `${transaction.id}_${shopId}`;

  return {
    uniqueKey,
    rawUpdatedAt: transaction.order_create_time,
    fields: compact({
      "ID định danh (TTS)": uniqueKey,
      "Ngày tạo đơn": datetime(transaction.order_create_time),
      "Mã đơn hàng": transaction.order_id ?? transaction.adjustment_order_id ?? null,
      "Mã giao dịch": String(transaction.id),
      "Mã điều chỉnh": transaction.adjustment_id ?? null,
      "Loại giao dịch": transaction.type ?? null,
      "ID Shop": shopId == null ? null : String(shopId),
      "Tên Shop": shopName ?? null,
      "Trạng thái": transaction.status ?? null,
      "Lý do chưa quyết toán": transaction.unsettled_reason ?? null,
      "Dự kiến quyết toán": transaction.estimated_settlement ?? null,

      // Keep the same Lark field names as settled finance for equivalent values.
      "Doanh thu (Gross)": number(transaction.est_revenue_amount),
      "Thực thu (Net)": number(transaction.est_settlement_amount),
      "Tổng phí & thuế": number(transaction.est_fee_tax_amount),
      "Số tiền điều chỉnh": number(transaction.est_adjustment_amount ?? transaction.adjustment_amount),
      "Phí ship người bán": number(transaction.est_shipping_cost_amount),
      "Tổng tiền tạm tính trước giảm giá": number(revenue.subtotal_before_discount_amount),
      "Hoàn tiền trước giảm giá": number(revenue.refund_subtotal_before_discount_amount),
      "Giảm giá người bán": number(revenue.seller_discount_amount),
      "Hoàn giảm giá người bán": number(revenue.seller_discount_refund_amount),
      "Hoa hồng Affiliate Ads": number(fee.affiliate_ads_commission_amount),
      "Hoa hồng Affiliate": number(fee.affiliate_commission_amount),
      "Hoa hồng Affiliate (trước PIT)": number(
        fee.affiliate_commission_before_pit_amount ?? fee.affiliate_commission_amount_before_pit,
      ),
      "Hoa hồng đối tác Affiliate": number(fee.affiliate_partner_commission_amount),
      "Phí Live Specials": number(fee.live_specials_fee_amount),
      "Phí nền tảng (Platform Commission)": number(fee.platform_commission_amount),
      "Phí đặt trước (Pre-order)": number(fee.pre_order_service_fee_amount),
      "Phí giao dịch (Transaction Fee)": number(fee.transaction_fee_amount),
      "Phí cơ sở hạ tầng (Infrastructure Fee)": number(fee.vn_fix_infrastructure_fee),
      "Phí Voucher Xtra": number(fee.voucher_xtra_service_fee_amount),
      "Phí Piship": number(fee.shipping_fee_guarantee_service_fee),
      "Thuế thu nhập cá nhân (PIT)": number(
        tax.pit_amount ?? fee.pit_withheld_from_ads_commission_amount,
      ),
      "Thuế VAT": number(tax.vat_amount),
      "Phí vận chuyển thực tế": number(shipping.actual_shipping_fee_amount),
      "Giảm giá phí vận chuyển": number(shipping.shipping_fee_discount_amount),
      "Giảm phí vận chuyển từ nền tảng": number(
        shippingSupplementary.platform_shipping_fee_discount_amount,
      ),

      // Unsettled-specific fields that explain the estimated totals.
      "Phí vận chuyển khách trả": number(shipping.customer_paid_shipping_fee_amount),
      "Phí dịch vụ COD": number(revenue.cod_service_fee_amount),
      "Hoàn phí dịch vụ COD": number(revenue.refund_cod_service_fee_amount),
    }),
  };
}
