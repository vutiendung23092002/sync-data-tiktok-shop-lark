import { DateTime } from "luxon";

import { VIETNAM_TIME_ZONE } from "./vietnamTime.js";

export function getSyncRange({ from: fromValue, to: toValue }, now = DateTime.now(), { maxTo = "yesterday" } = {}) {
  if (!new Set(["yesterday", "today"]).has(maxTo)) throw new Error(`Unknown maxTo policy: ${maxTo}`);
  const from = DateTime.fromFormat(fromValue, "yyyy/MM/dd", { zone: VIETNAM_TIME_ZONE }).startOf("day");
  const requestedTo = DateTime.fromFormat(toValue, "yyyy/MM/dd", { zone: VIETNAM_TIME_ZONE }).startOf("day");
  const today = now.setZone(VIETNAM_TIME_ZONE).startOf("day");
  const maximumTo = maxTo === "today" ? today : today.minus({ days: 1 });
  if (!from.isValid || !requestedTo.isValid) throw new Error("Invalid FROM/TO range; expected yyyy/MM/dd");

  const effectiveTo = requestedTo > maximumTo ? maximumTo : requestedTo;
  const toExclusive = effectiveTo.plus({ days: 1 });
  if (from >= toExclusive) throw new Error(`Invalid FROM/TO range after limiting TO to ${maxTo}`);

  return Object.freeze({
    from: Math.floor(from.toSeconds()),
    to: Math.floor(toExclusive.toSeconds()),
    requestedFrom: from.toFormat("yyyy/MM/dd"),
    requestedTo: requestedTo.toFormat("yyyy/MM/dd"),
    effectiveTo: effectiveTo.toFormat("yyyy/MM/dd"),
    toWasCapped: requestedTo > maximumTo,
    maxToPolicy: maxTo,
  });
}
