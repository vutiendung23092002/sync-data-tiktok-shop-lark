export function normalizeSku(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function createProductCostRepository({ query } = {}) {
  if (typeof query !== "function") throw new Error("query is required");
  async function findLatestBySellerSkus(sellerSkus) {
    const normalized = [...new Set(sellerSkus.map(normalizeSku).filter(Boolean))];
    if (normalized.length === 0) return new Map();
    const result = await query(`
      SELECT DISTINCT ON (LOWER(TRIM(sku)))
        LOWER(TRIM(sku)) AS normalized_sku, cost
      FROM kiot_legiahan.product_cost
      WHERE LOWER(TRIM(sku)) = ANY($1::text[])
      ORDER BY LOWER(TRIM(sku)), updated_at DESC NULLS LAST, id DESC
    `, [normalized]);
    return new Map(result.rows.map((row) => [row.normalized_sku, row.cost == null ? null : Number(row.cost)]));
  }
  return Object.freeze({ findLatestBySellerSkus });
}
