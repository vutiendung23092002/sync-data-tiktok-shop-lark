import { spawnSync } from "node:child_process";

import pino from "pino";
import pinoPretty from "pino-pretty";

export function isMsysTerminal({ platform = process.platform, msystem = process.env.MSYSTEM } = {}) {
  return platform === "win32" && /^(MINGW|MSYS)/i.test(String(msystem ?? ""));
}

export function shouldPrettyLogs({
  ci = process.env.CI,
  isTTY = Boolean(process.stdout.isTTY),
  msys = isMsysTerminal(),
} = {}) {
  const isCI = ci === true || ci === "1" || String(ci).toLowerCase() === "true";
  return !isCI && (isTTY || msys);
}

export function toAsciiLogText(value) {
  return String(value)
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "");
}

function terminalSafeValue(value, seen = new WeakSet()) {
  if (typeof value === "string") return toAsciiLogText(value);
  if (Array.isArray(value)) return value.map((item) => terminalSafeValue(item, seen));
  if (!value || typeof value !== "object" || value instanceof Date || value instanceof Error || Buffer.isBuffer(value)) return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [
    toAsciiLogText(key),
    terminalSafeValue(item, seen),
  ]));
  seen.delete(value);
  return result;
}

export function configureConsoleEncoding({
  platform = process.platform,
  spawn = spawnSync,
} = {}) {
  process.stdout.setDefaultEncoding?.("utf8");
  process.stderr.setDefaultEncoding?.("utf8");
  if (platform !== "win32") return false;
  const result = spawn("chcp.com", ["65001"], {
    stdio: "ignore",
    windowsHide: true,
  });
  return !result.error && result.status === 0;
}

export function createLogger({
  level = "info",
  asciiSafe = isMsysTerminal(),
  pretty = shouldPrettyLogs(),
  destination,
} = {}) {
  configureConsoleEncoding();
  const options = { level };
  if (asciiSafe) {
    options.hooks = {
      logMethod(args, method) {
        return method.apply(this, args.map((value) => terminalSafeValue(value)));
      },
    };
  }
  const output = destination ?? (pretty ? pinoPretty({
    colorize: true,
    colorizeObjects: true,
    ignore: "pid,hostname",
    singleLine: false,
    sync: true,
    translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
  }) : undefined);
  return output ? pino(options, output) : pino(options);
}
