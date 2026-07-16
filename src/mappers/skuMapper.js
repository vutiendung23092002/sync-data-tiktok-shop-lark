function countPopulated(fields) {
  return Object.values(fields).filter((value) => value !== undefined && value !== null && value !== "").length;
}

export function mapSkusFromOrders(orders = []) {
  const byId = new Map();
  for (const order of orders) {
    for (const item of order.line_items ?? []) {
      if (item.sku_id == null || item.sku_id === "") continue;
      const fields = {
        id_sku: String(item.sku_id),
        seller_sku: item.seller_sku ?? null,
        sku_name: item.sku_name ?? null,
        product_id: item.product_id == null ? null : String(item.product_id),
        product_name: item.product_name ?? null,
      };
      const compactFields = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null && value !== undefined && value !== ""));
      const existing = byId.get(fields.id_sku);
      if (!existing || countPopulated(compactFields) > countPopulated(existing.fields)) {
        byId.set(fields.id_sku, { uniqueKey: fields.id_sku, rawUpdatedAt: order.update_time, fields: compactFields });
      }
    }
  }
  return [...byId.values()];
}
