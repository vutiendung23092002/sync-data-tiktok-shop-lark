function normalizeText(value) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const text = value.map((item) => normalizeText(item)).filter((item) => item != null).join("");
    return text || null;
  }
  if (typeof value === "object") {
    if ("text" in value) return normalizeText(value.text);
    return JSON.stringify(sortObject(value));
  }
  const text = String(value).trim();
  return text || null;
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}

function normalizeDateTime(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.abs(numeric) < 1e12 ? numeric * 1000 : numeric;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeUrl(value) {
  if (value == null || value === "") return null;
  if (Array.isArray(value)) return normalizeUrl(value[0]);
  if (typeof value === "string") return Object.freeze({ text: null, link: value.trim() || null });
  const text = normalizeText(value.text);
  const link = normalizeText(value.link);
  return text || link ? Object.freeze({ text, link }) : null;
}

export function normalizeLarkValue(value, type = "auto") {
  switch (type) {
    case "text":
      return normalizeText(value);
    case "number": {
      if (value == null || value === "") return null;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }
    case "datetime":
      return normalizeDateTime(value);
    case "boolean":
      if (value == null || value === "") return null;
      if (typeof value === "string") return value.toLowerCase() === "true";
      return Boolean(value);
    case "url":
      return normalizeUrl(value);
    case "auto":
      if (value == null || value === "") return null;
      return sortObject(value);
    default:
      throw new Error(`Unknown Lark field type: ${type}`);
  }
}

export function isMeaningfulLarkValue(value) {
  if (value == null || value === "" || value === 0 || value === false) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(isMeaningfulLarkValue);
  if (typeof value === "object") return Object.values(value).some(isMeaningfulLarkValue);
  return true;
}
