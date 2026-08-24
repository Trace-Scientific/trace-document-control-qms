import { timingSafeEqual } from "node:crypto";

export function isAuthorizedCronRequest(authorization: string | null, secret = process.env.CRON_SECRET) {
  if (!secret || secret.length < 32 || !authorization?.startsWith("Bearer ")) return false;
  const supplied = authorization.slice(7);
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}
