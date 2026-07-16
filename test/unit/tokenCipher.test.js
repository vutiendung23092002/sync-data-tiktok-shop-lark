import assert from "node:assert/strict";
import test from "node:test";

import { decodeEncryptionKey } from "../../src/config/env.js";
import { createTokenCipher } from "../../src/crypto/tokenCipher.js";

test("raw fixed key is interpreted as exactly 32 UTF-8 bytes", () => {
  assert.equal(decodeEncryptionKey("08960114650896011465089601146523").length, 32);
});

test("token cipher round-trips token values", () => {
  const cipher = createTokenCipher("08960114650896011465089601146523");
  const encrypted = cipher.encrypt("sensitive-access-token");
  assert.equal(cipher.decrypt(encrypted), "sensitive-access-token");
});

test("token cipher generates a fresh IV for every encryption", () => {
  const cipher = createTokenCipher("08960114650896011465089601146523");
  const first = cipher.encrypt("same-token");
  const second = cipher.encrypt("same-token");
  assert.notEqual(first, second);
  assert.notEqual(first.split(":")[1], second.split(":")[1]);
});
