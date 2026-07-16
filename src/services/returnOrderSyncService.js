import { getLarkTableConfig } from "../config/larkTableMapping.js";
import { mapReturnOrder } from "../mappers/returnOrderMapper.js";
import { dedupeMappedRecords } from "../utils/dedupe.js";

export function createReturnOrderSyncService({ environment, packingRepository, larkUpsertService } = {}) {
  if (!packingRepository || !larkUpsertService) {
    throw new Error("packingRepository and larkUpsertService are required");
  }

  async function sync({ returnOrders, shop, range }) {
    if (!range) throw new Error("range is required");
    const sourceReturns = dedupeMappedRecords(returnOrders, {
      keySelector: (returnOrder) => returnOrder.return_id,
      timestampSelector: (returnOrder) => Number(returnOrder.update_time ?? returnOrder.create_time ?? 0),
    });
    const mapped = [];
    let returnTrackingNumbers = 0;
    let videoMatches = 0;
    const packingMap = await packingRepository.findLatestByTrackingNumbers(
      sourceReturns.map((returnOrder) => returnOrder.return_tracking_number),
    );
    for (const returnOrder of sourceReturns) {
      const trackingNumber = String(returnOrder.return_tracking_number ?? "").trim();
      if (trackingNumber) returnTrackingNumbers += 1;
      const packing = packingMap.get(trackingNumber);
      if (packing?.linkDrive) videoMatches += 1;
      mapped.push(mapReturnOrder(returnOrder, {
        shopId: shop.shopId,
        shopName: shop.shopName,
        packing,
      }));
    }
    const table = getLarkTableConfig({ environment, type: "returnOrders" });
    const result = await larkUpsertService.upsert({
      ...table,
      records: mapped,
      lookup: { type: "dateRange", fieldName: "Ngày tạo", from: range.from, to: range.to },
      schemaType: "returnOrders",
    });
    return Object.freeze({
      fetched: returnOrders.length,
      deduped: sourceReturns.length,
      returnTrackingNumbers,
      videoMatches,
      table: Object.freeze({ type: "returnOrders", tableId: table.tableId, ...result }),
    });
  }

  return Object.freeze({ sync });
}
