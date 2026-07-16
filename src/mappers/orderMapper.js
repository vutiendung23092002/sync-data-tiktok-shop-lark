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

function packageValue(packages) {
  if (!Array.isArray(packages) || packages.length === 0) return null;
  if (packages.length === 1) return String(packages[0]?.id ?? packages[0]?.package_id ?? packages[0]);
  return JSON.stringify(packages);
}

function compact(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null && value !== undefined));
}

export function mapOrder(order, { shopId, shopName, packing } = {}) {
  const payment = order.payment ?? {};
  return {
    uniqueKey: `${order.id}_${shopId}`,
    rawUpdatedAt: order.update_time,
    fields: compact({
      "ID định danh (TTS)": `${order.id}_${shopId}`,
      "Mã đơn hàng": String(order.id),
      "Mã vận đơn": order.tracking_number ?? null,
      "Ngày tạo đơn": datetime(order.create_time),
      "Thời gian thanh toán": datetime(order.paid_time),
      "Trạng thái": order.status ?? null,
      "Tổng tiền": number(payment.total_amount),
      "Tổng tiền tạm tính": number(payment.sub_total),
      "Giảm giá sàn": number(payment.platform_discount),
      "Giảm giá người bán": number(payment.seller_discount),
      "Tổng giá gốc sản phẩm": number(payment.original_total_product_price),
      "Phí vận chuyển": number(payment.shipping_fee),
      "Lý do huỷ": order.cancel_reason ?? null,
      "Thuế": number(payment.tax),
      "Thuế sản phẩm": number(payment.product_tax),
      "Tên shop": shopName ?? null,
      "Phí xử lý": number(payment.handling_fee),
      "Nơi xử lý đơn": order.fulfillment_type ?? null,
      "Thời hạn tự huỷ đơn": datetime(order.cancel_order_sla_time),
      "Người khởi tạo huỷ": order.cancellation_initiator ?? null,
      "ID gói hàng": packageValue(order.packages),
      "Thời gian huỷ": datetime(order.cancel_time),
      "Thời hạn giao hàng": datetime(order.delivery_due_time),
      "Thời gian giao hàng": datetime(order.delivery_time),
      "Nền tảng thương mại": order.commerce_platform ?? null,
      "Đơn vị VC": order.shipping_provider ?? null,
      "RTS time": datetime(order.rts_time),
      "Video đóng hàng": packing?.linkDrive ? { text: "Link video đóng hàng", link: packing.linkDrive } : null,
      "Nhân viên đóng hàng": packing?.employee ?? null,
    }),
  };
}

export function mapOrderItem(item, order, { shopId, shopName, cost } = {}) {
  return {
    uniqueKey: `${item.id}_${shopId}`,
    rawUpdatedAt: order.update_time,
    fields: compact({
      "ID định danh (TTS)": `${item.id}_${shopId}`,
      "Mã đơn hàng": String(order.id),
      "Mã Item": String(item.id),
      "Mã vận đơn": item.tracking_number ?? order.tracking_number ?? null,
      "Ngày tạo đơn": datetime(order.create_time),
      "Mã SKU": item.sku_id == null ? null : String(item.sku_id),
      "Mã sản phẩm": item.seller_sku ?? null,
      "Tên sản phẩm": item.product_name ?? null,
      "Là quà tặng?": item.is_gift == null ? null : String(item.is_gift),
      "Trạng thái": item.display_status ?? null,
      "Tên shop": shopName ?? null,
      "Giá bán lẻ của quà tặng": number(item.gift_retail_price),
      "Giảm giá sàn": number(item.platform_discount),
      "Giảm giá người bán": number(item.seller_discount),
      "Giá gốc": number(item.original_price),
      "Giá bán sản phẩm": number(item.sale_price),
      "Giá vốn": cost ?? null,
    }),
  };
}
