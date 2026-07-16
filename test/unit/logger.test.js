import assert from "node:assert/strict";
import test from "node:test";

import {
  configureConsoleEncoding,
  createLogger,
  isMsysTerminal,
  shouldPrettyLogs,
  toAsciiLogText,
} from "../../src/utils/logger.js";

test("Windows logger always switches the console to UTF-8, including Git Bash pipes", () => {
  const calls = [];
  const configured = configureConsoleEncoding({
    platform: "win32",
    spawn: (...args) => {
      calls.push(args);
      return { status: 0 };
    },
  });
  assert.equal(configured, true);
  assert.deepEqual(calls[0][0], "chcp.com");
  assert.deepEqual(calls[0][1], ["65001"]);
  assert.equal(calls[0][2].windowsHide, true);
});

test("non-Windows logs do not invoke chcp", () => {
  let calls = 0;
  const spawn = () => { calls += 1; };
  assert.equal(configureConsoleEncoding({ platform: "linux", spawn }), false);
  assert.equal(calls, 0);
});

test("Windows logger reports a failed code-page switch", () => {
  assert.equal(configureConsoleEncoding({
    platform: "win32",
    spawn: () => ({ status: 1 }),
  }), false);
});

test("Git Bash detection is limited to Windows MSYS environments", () => {
  assert.equal(isMsysTerminal({ platform: "win32", msystem: "MINGW64" }), true);
  assert.equal(isMsysTerminal({ platform: "win32", msystem: "MSYS" }), true);
  assert.equal(isMsysTerminal({ platform: "win32", msystem: undefined }), false);
  assert.equal(isMsysTerminal({ platform: "linux", msystem: "MINGW64" }), false);
});

test("pretty logs are local-only and remain JSON in CI", () => {
  assert.equal(shouldPrettyLogs({ ci: undefined, isTTY: true, msys: false }), true);
  assert.equal(shouldPrettyLogs({ ci: undefined, isTTY: false, msys: true }), true);
  assert.equal(shouldPrettyLogs({ ci: "true", isTTY: true, msys: true }), false);
  assert.equal(shouldPrettyLogs({ ci: undefined, isTTY: false, msys: false }), false);
});

test("ASCII-safe logger keeps Vietnamese log fields readable in Git Bash", () => {
  assert.equal(toAsciiLogText("Trạng thái / Lý do huỷ / Mã vận đơn"), "Trang thai / Ly do huy / Ma van don");
  const output = [];
  const logger = createLogger({
    asciiSafe: true,
    pretty: false,
    destination: { write: (line) => output.push(line) },
  });
  logger.info({ changedFieldCounts: { "Lý do huỷ": 1, "Mã vận đơn": 5 } }, "Đồng bộ hoàn tất");
  const logged = JSON.parse(output[0]);
  assert.deepEqual(logged.changedFieldCounts, { "Ly do huy": 1, "Ma van don": 5 });
  assert.equal(logged.msg, "Dong bo hoan tat");
});
