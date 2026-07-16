export function createPackingRepository({ query, logger } = {}) {
  if (typeof query !== "function") throw new Error("query is required");
  async function findLatestByTrackingNumbers(trackingNumbers) {
    const values = [...new Set(trackingNumbers.map((value) => String(value ?? "").trim()).filter(Boolean))];
    if (values.length === 0) return new Map();
    const result = await query(`
      SELECT tracking_number, employee, link_drive, date, time, tied_count
      FROM (
        SELECT tracking_number, employee, link_drive, date, time,
          ROW_NUMBER() OVER (
            PARTITION BY tracking_number
            ORDER BY date DESC NULLS LAST, time DESC NULLS LAST
          ) AS position,
          COUNT(*) OVER (PARTITION BY tracking_number, date, time) AS tied_count
        FROM han_logistics.cam_dong_hang
        WHERE tracking_number = ANY($1::text[])
      ) ranked
      WHERE position = 1
    `, [values]);
    for (const row of result.rows) {
      if (Number(row.tied_count) > 1) logger?.warn?.({ trackingNumber: row.tracking_number }, "Ambiguous packing rows share the latest timestamp");
    }
    return new Map(result.rows.map((row) => [row.tracking_number, {
      employee: row.employee ?? null,
      linkDrive: row.link_drive ?? null,
    }]));
  }
  return Object.freeze({ findLatestByTrackingNumbers });
}
