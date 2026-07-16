import { DateTime } from "luxon";

export const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

export function toVietnamDateTime(value) {
  let dateTime;
  if (value instanceof Date) dateTime = DateTime.fromJSDate(value);
  else if (typeof value === "number" || /^\d+(\.\d+)?$/.test(String(value))) {
    const numeric = Number(value);
    dateTime = Math.abs(numeric) < 1e12 ? DateTime.fromSeconds(numeric) : DateTime.fromMillis(numeric);
  } else {
    dateTime = DateTime.fromISO(String(value), { setZone: true });
  }
  if (!dateTime.isValid) throw new Error(`Invalid timestamp: ${value}`);
  return dateTime.setZone(VIETNAM_TIME_ZONE);
}

export function getVietnamMonth(value) {
  return toVietnamDateTime(value).month;
}
