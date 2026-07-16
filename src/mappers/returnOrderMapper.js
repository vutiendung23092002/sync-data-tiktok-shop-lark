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

function text(value) {
  if (value == null || value === "") return null;
  return String(value);
}

function productNames(items) {
  const names = (items ?? []).map((item) => item?.product_name).filter(Boolean);
  return names.length > 0 ? names.join(", ") : null;
}

function compact(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null && value !== undefined));
}

export function mapReturnOrder(returnOrder, { shopId, shopName, packing } = {}) {
  if (!returnOrder?.return_id) throw new Error("Return order return_id is required");
  const refund = returnOrder.refund_amount ?? {};
  const discount = returnOrder.discount_amount?.[0] ?? {};
  const shipping = returnOrder.shipping_fee_amount?.[0] ?? {};

  return {
    uniqueKey: `${returnOrder.return_id}_${shopId}`,
    rawUpdatedAt: returnOrder.update_time,
    fields: compact({
      "ID định danh (TTS)": `${returnOrder.return_id}_${shopId}`,
      "Mã đơn hàng": text(returnOrder.order_id),
      "Mã trả hàng": text(returnOrder.return_id),
      "Mã trả hàng gộp": text(returnOrder.combined_return_id),
      "Ngày tạo": datetime(returnOrder.create_time),
      "Phương thức bàn giao": text(returnOrder.handover_method),
      "Trả hàng gộp": text(returnOrder.is_combined_return),
      "Phương thức trả hàng": text(returnOrder.return_method),
      "ID đơn vị vận chuyển": text(returnOrder.return_provider_id),
      "Tên đơn vị vận chuyển": text(returnOrder.return_provider_name),
      "Lý do trả hàng": text(returnOrder.return_reason_text),
      "Trạng thái trả hàng": text(returnOrder.return_status),
      "Sản phẩm trả hàng": productNames(returnOrder.return_line_items),
      "Mã vận đơn trả hàng": text(returnOrder.return_tracking_number),
      "Video trả hàng": packing?.linkDrive ? { text: "Link video trả hàng", link: packing.linkDrive } : null,
      "Loại trả hàng": text(returnOrder.return_type),
      "Vai trò": text(returnOrder.role),
      "Loại vận chuyển": text(returnOrder.shipment_type),
      "Thời gian cập nhật": datetime(returnOrder.update_time),
      "ID Shop": text(shopId),
      "Tên Shop": text(shopName),
      "Phí ship được refund": number(refund.refund_shipping_fee),
      "Subtotal refund": number(refund.refund_subtotal),
      "Thuế được refund": number(refund.refund_tax),
      "Tổng refund": number(refund.refund_total),
      "Giảm giá nền tảng (sản phẩm)": number(discount.product_platform_discount),
      "Giảm giá người bán (sản phẩm)": number(discount.product_seller_discount),
      "Giảm giá vận chuyển nền tảng": number(discount.shipping_fee_platform_discount),
      "Giảm giá vận chuyển người bán": number(discount.shipping_fee_seller_discount),
      "Phí trả hàng do người mua trả": number(shipping.buyer_paid_return_shipping_fee),
      "Phí trả hàng nền tảng trả": number(shipping.platform_paid_return_shipping_fee),
      "Phí trả hàng người bán trả": number(shipping.seller_paid_return_shipping_fee),
    }),
  };
}
