import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_ALGORITHM = "scrypt";
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const HASH_LENGTH = 64;
const SALT_LENGTH = 16;

function getScryptMaxMemory(n: number, r: number) {
  return 128 * n * r + 1_048_576;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(SALT_LENGTH);
  const derived = scryptSync(password, salt, HASH_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: getScryptMaxMemory(SCRYPT_N, SCRYPT_R),
  }) as Buffer;

  return [
    SCRYPT_ALGORITHM,
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, storedHash: string) {
  if (!storedHash) {
    return false;
  }

  const [algorithm, nRaw, rRaw, pRaw, saltRaw, expectedRaw] = storedHash.split("$");
  if (!algorithm || !nRaw || !rRaw || !pRaw || !saltRaw || !expectedRaw || algorithm !== SCRYPT_ALGORITHM) {
    return false;
  }

  const n = Number.parseInt(nRaw, 10);
  const r = Number.parseInt(rRaw, 10);
  const p = Number.parseInt(pRaw, 10);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p) || n <= 1 || r <= 0 || p <= 0) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltRaw, "base64url");
    expected = Buffer.from(expectedRaw, "base64url");
  } catch {
    return false;
  }

  if (salt.length === 0 || expected.length === 0) {
    return false;
  }

  try {
    const actual = scryptSync(password, salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: getScryptMaxMemory(n, r),
    }) as Buffer;

    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
