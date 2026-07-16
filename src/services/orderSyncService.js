import { getLarkTableConfig } from "../config/larkTableMapping.js";
import { mapOrder, mapOrderItem } from "../mappers/orderMapper.js";
import { mapSkusFromOrders } from "../mappers/skuMapper.js";
import { normalizeSku } from "../repositories/productCostRepository.js";
import { dedupeMappedRecords } from "../utils/dedupe.js";
import { getVietnamMonth } from "../utils/vietnamTime.js";

function groupByTable(records) {
  const groups = new Map();
  for (const record of records) {
    const key = `${record.baseId}:${record.tableId}`;
    if (!groups.has(key)) groups.set(key, { baseId: record.baseId, tableId: record.tableId, records: [] });
    groups.get(key).records.push(record.mapped);
  }
  return [...groups.values()];
}

export function createOrderSyncService({
  environment,
  productCostRepository,
  packingRepository,
  larkUpsertService,
} = {}) {
  if (!productCostRepository || !packingRepository || !larkUpsertService) {
    throw new Error("productCostRepository, packingRepository and larkUpsertService are required");
  }

  async function sync({ orders, shop, range }) {
    if (!range) throw new Error("range is required");
    const sourceOrders = dedupeMappedRecords(orders, {
      keySelector: (order) => order.id,
      timestampSelector: (order) => Number(order.update_time ?? 0),
    });
    const packingMap = await packingRepository.findLatestByTrackingNumbers(sourceOrders.map((order) => order.tracking_number));
    const allItems = sourceOrders.flatMap((order) => order.line_items ?? []);
    const costMap = await productCostRepository.findLatestBySellerSkus(allItems.map((item) => item.seller_sku));
    const orderRecords = [];
    const itemRecords = [];
    for (const order of sourceOrders) {
      const month = getVietnamMonth(order.create_time);
      const orderTable = getLarkTableConfig({ environment, type: "orders", month });
      orderRecords.push({ ...orderTable, mapped: mapOrder(order, { shopId: shop.shopId, shopName: shop.shopName, packing: packingMap.get(order.tracking_number) }) });
      const itemTable = getLarkTableConfig({ environment, type: "orderItems", month });
      for (const item of order.line_items ?? []) {
        itemRecords.push({ ...itemTable, mapped: mapOrderItem(item, order, {
          shopId: shop.shopId,
          shopName: shop.shopName,
          cost: costMap.get(normalizeSku(item.seller_sku)) ?? null,
        }) });
      }
    }
    const dateLookup = { type: "dateRange", fieldName: "Ngày tạo đơn", from: range.from, to: range.to };
    const results = [];
    for (const group of groupByTable(orderRecords)) {
      results.push({ type: "orders", tableId: group.tableId, ...await larkUpsertService.upsert({ ...group, lookup: dateLookup, schemaType: "orders" }) });
    }
    for (const group of groupByTable(itemRecords)) {
      results.push({ type: "orderItems", tableId: group.tableId, ...await larkUpsertService.upsert({
        ...group,
        lookup: dateLookup,
        schemaType: "orderItems",
        protectedFields: ["Giá vốn", "Mã sản phẩm"],
      }) });
    }
    const skuTable = getLarkTableConfig({ environment, type: "skus" });
    const skuResult = await larkUpsertService.upsert({
      ...skuTable,
      records: mapSkusFromOrders(sourceOrders),
      uniqueFieldName: "id_sku",
      lookup: { type: "all" },
      schemaType: "skus",
    });
    results.push({ type: "skus", tableId: skuTable.tableId, ...skuResult });
    return { fetched: orders.length, deduped: sourceOrders.length, tables: results };
  }
  return Object.freeze({ sync });
}
