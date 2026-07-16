import { isDeepStrictEqual } from "node:util";

import { isMeaningfulLarkValue, normalizeLarkValue } from "./normalize.js";

export function diffFields({ desired, current, fieldTypes = {}, protectedFields = [] }) {
  if (!desired || typeof desired !== "object" || Array.isArray(desired)) throw new Error("desired must be an object");
  const existing = current ?? {};
  const protectedSet = new Set(protectedFields);
  const changes = {};
  const changedFields = [];
  const skippedProtectedFields = [];

  for (const [field, desiredValue] of Object.entries(desired)) {
    if (protectedSet.has(field) && isMeaningfulLarkValue(existing[field])) {
      skippedProtectedFields.push(field);
      continue;
    }
    const type = fieldTypes[field] ?? "auto";
    const normalizedDesired = normalizeLarkValue(desiredValue, type);
    const normalizedCurrent = normalizeLarkValue(existing[field], type);
    if (!isDeepStrictEqual(normalizedDesired, normalizedCurrent)) {
      changes[field] = desiredValue;
      changedFields.push(field);
    }
  }

  return Object.freeze({
    changes: Object.freeze(changes),
    changedFields: Object.freeze(changedFields),
    skippedProtectedFields: Object.freeze(skippedProtectedFields),
    hasChanges: changedFields.length > 0,
  });
}
