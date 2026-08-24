import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const PASSWORD_KEY_LENGTH = 64;
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function opaqueTokenMatches(token: string, expectedHash: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) return false;

  const actual = Buffer.from(hashOpaqueToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return timingSafeEqual(actual, expected);
}

export function hashPassword(password: string): string {
  if (password.length < 12) {
    throw new Error("Password must contain at least 12 characters");
  }

  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, PASSWORD_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: 64 * 1024 * 1024,
  });

  return [
    "scrypt",
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export function verifyPassword(password: string, encodedHash: string): boolean {
  const [algorithm, cost, blockSize, parallelization, salt, expected] =
    encodedHash.split("$");

  if (
    algorithm !== "scrypt" ||
    !cost ||
    !blockSize ||
    !parallelization ||
    !salt ||
    !expected
  ) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, "base64url");
  if (expectedBuffer.length !== PASSWORD_KEY_LENGTH) return false;

  try {
    const actual = scryptSync(password, Buffer.from(salt, "base64url"), PASSWORD_KEY_LENGTH, {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelization),
      maxmem: 64 * 1024 * 1024,
    });
    return timingSafeEqual(actual, expectedBuffer);
  } catch {
    return false;
  }
}
