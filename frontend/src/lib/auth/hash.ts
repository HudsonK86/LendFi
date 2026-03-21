import { randomBytes, pbkdf2Sync, timingSafeEqual } from "node:crypto";

const ITERATIONS = 100_000;
const KEYLEN = 32;
const DIGEST = "sha256";

/** PBKDF2-SHA256 password hash with random 16-byte salt (hex-encoded). */
export function hashPassword(password: string): { hash: string; salt: string } {
  const saltBuf = randomBytes(16);
  const hashBuf = pbkdf2Sync(password, saltBuf, ITERATIONS, KEYLEN, DIGEST);
  return {
    hash: hashBuf.toString("hex"),
    salt: saltBuf.toString("hex"),
  };
}

export function verifyPassword(password: string, hashHex: string, saltHex: string): boolean {
  let expected: Buffer;
  try {
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== KEYLEN) return false;
  const saltBuf = Buffer.from(saltHex, "hex");
  if (saltBuf.length !== 16) return false;
  const derived = pbkdf2Sync(password, saltBuf, ITERATIONS, KEYLEN, DIGEST);
  return timingSafeEqual(derived, expected);
}
