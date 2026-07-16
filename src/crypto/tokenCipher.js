import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { decodeEncryptionKey } from "../config/env.js";

const ALGORITHM = "aes-256-cbc";
const FORMAT_VERSION = "v1";

export function createTokenCipher(secretKey) {
  const key = decodeEncryptionKey(secretKey);

  function encrypt(plaintext) {
    if (typeof plaintext !== "string") throw new TypeError("Token plaintext must be a string");
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return `${FORMAT_VERSION}:${iv.toString("base64")}:${ciphertext.toString("base64")}`;
  }

  function decrypt(payload) {
    if (typeof payload !== "string") throw new TypeError("Encrypted token must be a string");
    const [version, encodedIv, encodedCiphertext, extra] = payload.split(":");
    if (version !== FORMAT_VERSION || !encodedIv || !encodedCiphertext || extra !== undefined) {
      throw new Error("Invalid encrypted token format");
    }
    const iv = Buffer.from(encodedIv, "base64");
    if (iv.length !== 16) throw new Error("Invalid AES-CBC IV length");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }

  return Object.freeze({ encrypt, decrypt });
}
