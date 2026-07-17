const MONTHS = Object.freeze(Array.from({ length: 12 }, (_, index) => index + 1));

function monthly(values) {
  return Object.freeze(Object.fromEntries(values.map((tableId, index) => [index + 1, tableId])));
}

export const LARK_TABLE_MAPPING = Object.freeze({
  production: Object.freeze({
    baseId: "Fg8lbmhRuaDGBwsDbcKlCCf3g6b",
    orders: monthly([
      "tblRnv8YY56TbQGY", "tbl7POESgrMyJACV", "tblJsM8YkpssnudP", "tblGbz3L9icMNoFa",
      "tblFdtnKTOdSWmc4", "tbloOvkxhdZjQzXv", "tblDhITfQhIBGcla", "tblat1p1bNvPOaGV",
      "tblgtlatMYJdBPEM", "tblnqnoqrHTB8cxg", "tblfoO3snnymo6sb", "tblIGF42hFnZNhWl",
    ]),
    orderItems: monthly([
      "tblYgB3iwNP13M7Z", "tblZlC2P0wt79uZS", "tblPqWKwCWweDBqS", "tbldvthqZpvUSzHs",
      "tblvqYCD2W4VWILx", "tbl4io1NqSsmf4Ru", "tblywgctf8AraqFb", "tblNks1NqBuvQG6U",
      "tblnJFK900GfNMAW", "tblGNP0NGvWEnzAB", "tblUaFFYNxE7lWSl", "tblbobWaNgI8elHo",
    ]),
    finance: monthly([
      "tbldO66icmmaewCV", "tblKRtsT8LuImW9i", "tblCTLuzfmr1i04i", "tblD8EcTBGPfU3FM",
      "tbli2sHoithGe6pC", "tblSij8kGKQjMm7y", "tbljb1XG0NvizvhA", "tblS6CLBwvdp7j82",
      "tblzSeO242kdzjMd", "tblhMbFVkYB3ORLe", "tblTil5RUu73N0d9", "tbld5VD8m5083JAH",
    ]),
    returnOrders: "tblnjLBEA5z2YPWi",
    skus: "tblLQJtTQeHekkcm",
    unsettledTransactions: "tblkcawPHaBJQqSp",
  }),
  test: Object.freeze({
    baseId: "Df3WbKnmyaeUKJsphablcI8Jgeh",
    orders: monthly([
      "tblh0QgymJnE6olE", "tblhWr9f9se4y0fK", "tbl1At918G8pjNSK", "tblmAUaUEBtxURdQ",
      "tblyVqv6DmBIBqnB", "tblBAV7aYGj4Qa4G", "tblkupL9uPIsiJ9O", "tblqbPymyhNCx1LH",
      "tblAuWFaruBDEB7s", "tblhh3UsO6lD3rQG", "tbli5cyX0KAm424R", "tblwk2WxIpIQQgvL",
    ]),
    orderItems: monthly([
      "tblbmEZQzpQcR2jE", "tblX8aQABGvJd4hf", "tblLxBR0CSZGNoYd", "tblnjihiopgqM8Rm",
      "tblgpw1uzct7xNLD", "tblwivICvVvfCl40", "tblJbG2jeSeKHcnu", "tblLNZhnGFrArpew",
      "tblsuxxA1oWTB3Gx", "tblH1V3LVSo0rKpP", "tbleLbgfOoUfnomb", "tblCzXIQrAS7Fr3W",
    ]),
    finance: monthly([
      "tbl81e0Gr0RHeKCy", "tbl6Deh2b8abozpe", "tbl6XWM0vj5AN4Lx", "tbl5kxj1T1x5hZQT",
      "tbldqnIJben7hJ8c", "tblanTxETHnS2wid", "tbluzw4d0jO8pNtk", "tbll632Hg6XM5awj",
      "tblpjM6q7m1VAd3F", "tblbLtOOeb0e5zmU", "tblW8hcYAEaGdmkM", "tblh6i0oQzyL44v1",
    ]),
    returnOrders: "tbly3C00nrthqV0H",
    skus: "tblSu9mTdLHf6CRI",
    unsettledTransactions: "tbl0uBF1PCAVgEne",
  }),
});

const MONTHLY_TYPES = Object.freeze(["orders", "orderItems", "finance"]);

export function validateLarkTableMapping(environment, mapping = LARK_TABLE_MAPPING) {
  const config = mapping[environment];
  if (!config) throw new Error(`Unknown Lark mapping environment: ${environment}`);
  if (!config.baseId) throw new Error(`Missing Lark baseId for ${environment}`);

  const allIds = [];
  for (const type of MONTHLY_TYPES) {
    const tableMap = config[type] ?? {};
    const keys = Object.keys(tableMap).map(Number).sort((a, b) => a - b);
    if (keys.length !== 12 || !MONTHS.every((month, index) => keys[index] === month)) {
      throw new Error(`Lark mapping ${environment}.${type} must contain every month from 1 to 12`);
    }
    for (const month of MONTHS) {
      const tableId = tableMap[month];
      if (typeof tableId !== "string" || !tableId.trim()) {
        throw new Error(`Missing Lark table ID: ${environment}.${type}.${month}`);
      }
      allIds.push(tableId);
    }
  }
  if (typeof config.returnOrders !== "string" || !config.returnOrders.trim()) {
    throw new Error(`Missing Lark return orders table ID for ${environment}`);
  }
  allIds.push(config.returnOrders);
  if (typeof config.skus !== "string" || !config.skus.trim()) {
    throw new Error(`Missing Lark SKUS table ID for ${environment}`);
  }
  allIds.push(config.skus);
  if (typeof config.unsettledTransactions !== "string" || !config.unsettledTransactions.trim()) {
    throw new Error(`Missing Lark unsettled transactions table ID for ${environment}`);
  }
  allIds.push(config.unsettledTransactions);
  if (new Set(allIds).size !== allIds.length) {
    throw new Error(`Duplicate Lark table ID found in ${environment} mapping`);
  }
  return config;
}

export function getLarkTableConfig({ environment, type, month }) {
  const config = validateLarkTableMapping(environment);
  if (type === "returnOrders") return Object.freeze({ baseId: config.baseId, tableId: config.returnOrders });
  if (type === "skus") return Object.freeze({ baseId: config.baseId, tableId: config.skus });
  if (type === "unsettledTransactions") {
    return Object.freeze({ baseId: config.baseId, tableId: config.unsettledTransactions });
  }
  if (!MONTHLY_TYPES.includes(type)) throw new Error(`Unknown Lark table type: ${type}`);
  const normalizedMonth = Number(month);
  if (!Number.isInteger(normalizedMonth) || normalizedMonth < 1 || normalizedMonth > 12) {
    throw new Error(`Invalid Lark table month: ${month}`);
  }
  return Object.freeze({ baseId: config.baseId, tableId: config[type][normalizedMonth] });
}
