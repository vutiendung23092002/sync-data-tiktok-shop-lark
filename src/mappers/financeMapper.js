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

function sumAmounts(...values) {
  const amounts = values.map(number).filter((value) => value != null);
  return amounts.length === 0 ? null : amounts.reduce((total, value) => total + value, 0);
}

function compact(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null && value !== undefined));
}

export function mapFinanceTransaction(transaction, { statement, shopId, shopName } = {}) {
  if (!transaction?.id) throw new Error("Finance transaction id is required");
  const supplementary = transaction.supplementary_component ?? {};
  const revenue = transaction.revenue_breakdown ?? {};
  const fee = transaction.fee_tax_breakdown?.fee ?? {};
  const tax = transaction.fee_tax_breakdown?.tax ?? {};
  const shipping = transaction.shipping_cost_breakdown ?? {};
  const statementTime = transaction.statement_time ?? statement?.statement_time;
  const statementId = transaction.statement_id ?? statement?.id;

  return {
    uniqueKey: `${transaction.id}_${shopId}`,
    rawUpdatedAt: statementTime,
    statementTime,
    fields: compact({
      "ID định danh (TTS)": `${transaction.id}_${shopId}`,
      "Ngày tạo đơn": datetime(transaction.order_create_time),
      "Ngày quyết toán": datetime(statementTime),
      "Mã statemen": statementId == null ? null : String(statementId),
      "Mã đơn hàng": transaction.order_id ?? transaction.adjustment_order_id ?? null,
      "Mã giao dịch": String(transaction.id),
      "Mã điều chỉnh": transaction.adjustment_id ?? null,
      "Loại giao dịch": transaction.type ?? null,
      "ID Shop": shopId == null ? null : String(shopId),
      "Tên Shop": shopName ?? null,
      "Doanh thu (Gross)": number(transaction.revenue_amount),
      "Thực thu (Net)": number(transaction.settlement_amount),
      "Tổng phí & thuế": number(transaction.fee_tax_amount),
      "Tổng phí": sumAmounts(transaction.fee_tax_amount, transaction.shipping_cost_amount),
      "Số tiền điều chỉnh": number(transaction.adjustment_amount),
      "Phí ship người bán": number(transaction.shipping_cost_amount),
      "Khách hàng thanh toán": number(supplementary.customer_payment_amount),
      "Hoàn tiền cho khách": number(supplementary.customer_refund_amount),
      "Phí CFV (Sàn)": number(supplementary.platform_cofunded_discount_amount),
      "Hoàn phí CFV (Sàn)": number(supplementary.platform_cofunded_discount_refund_amount),
      "Giảm giá sàn": number(supplementary.platform_discount_amount),
      "Hoàn giảm giá sàn": number(supplementary.platform_discount_refund_amount),
      "Phí giao hàng bán lẻ": number(supplementary.retail_delivery_fee_amount),
      "Thanh toán phí giao hàng bán lẻ": number(supplementary.retail_delivery_fee_payment_amount),
      "Hoàn phí giao hàng bán lẻ": number(supplementary.retail_delivery_fee_refund_amount),
      "Thuế bán hàng": number(supplementary.sales_tax_amount),
      "Thanh toán thuế bán hàng": number(supplementary.sales_tax_payment_amount),
      "Hoàn thuế bán hàng": number(supplementary.sales_tax_refund_amount),
      "Phí CFV (Người bán)": number(supplementary.seller_cofunded_discount_amount),
      "Hoàn phí CFV (Người bán)": number(supplementary.seller_cofunded_discount_refund_amount),
      "Tổng tiền tạm tính trước giảm giá": number(revenue.subtotal_before_discount_amount),
      "Hoàn tiền trước giảm giá": number(revenue.refund_subtotal_before_discount_amount),
      "Giảm giá người bán": number(revenue.seller_discount_amount),
      "Hoàn giảm giá người bán": number(revenue.seller_discount_refund_amount),
      "Hoa hồng Affiliate Ads": number(fee.affiliate_ads_commission_amount),
      "Hoa hồng Affiliate": number(fee.affiliate_commission_amount),
      "Hoa hồng Affiliate (trước PIT)": number(fee.affiliate_commission_amount_before_pit),
      "Hoa hồng đối tác Affiliate": number(fee.affiliate_partner_commission_amount),
      "Phí Live Specials": number(fee.live_specials_fee_amount),
      "Phí nền tảng (Platform Commission)": number(fee.platform_commission_amount),
      "Phí đặt trước (Pre-order)": number(fee.pre_order_service_fee_amount),
      "Phí giao dịch (Transaction Fee)": number(fee.transaction_fee_amount),
      "Phí cơ sở hạ tầng (Infrastructure Fee)": number(fee.vn_fix_infrastructure_fee),
      "Phí Voucher Xtra": number(fee.voucher_xtra_service_fee_amount),
      "Phí Piship": number(fee.shipping_fee_guarantee_service_fee),
      "Thuế thu nhập cá nhân (PIT)": number(tax.pit_amount),
      "Thuế VAT": number(tax.vat_amount),
      "Phí vận chuyển thực tế": number(shipping.actual_shipping_fee_amount),
      "Giảm giá phí vận chuyển": number(shipping.shipping_fee_discount_amount),
      "Giảm phí vận chuyển từ nền tảng": number(shipping.supplementary_component?.platform_shipping_fee_discount_amount),
    }),
  };
}
