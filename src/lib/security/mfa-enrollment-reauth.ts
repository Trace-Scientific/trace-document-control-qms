import type { NextRequest } from "next/server";
import { db } from "../db";
import { verifyPassword } from "./crypto";
import { authenticateRequest } from "./authenticated-request";

const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

// Enrollment is a sensitive account change. Require a valid tenant-scoped
// session AND a fresh password check; possession of a session alone is not enough.
// Never accept organizationId/userId from the request body.
export async function reauthenticateForMfaEnrollment(
  request: NextRequest,
  password: string,
): Promise<{ organizationId: string; userId: string } | null> {
  const context = await authenticateRequest(request);
  const now = new Date();
  const failures = await db.authenticationEvent.count({
    where: {
      organizationId: context.organizationId,
      userId: context.userId,
      eventType: "REAUTHENTICATION",
      outcome: "FAILURE",
      occurredAt: { gte: new Date(now.getTime() - FAILURE_WINDOW_MS) },
    },
  });
  if (failures >= MAX_FAILURES) return null;

  const user = await db.user.findUnique({
    where: { id: context.userId },
    select: {
      id: true, organizationId: true, status: true, mfaEnabled: true,
      organization: { select: { active: true } },
      credential: { select: { passwordHash: true, disabledAt: true } },
    },
  });
  const valid = typeof password === "string" && password.length >= 1 && password.length <= 1024 &&
    user?.organizationId === context.organizationId &&
    user.status === "ACTIVE" && user.organization.active &&
    !user.mfaEnabled && !!user.credential && !user.credential.disabledAt &&
    verifyPassword(password, user.credential.passwordHash);

  await db.authenticationEvent.create({
    data: {
      organizationId: context.organizationId,
      userId: context.userId,
      eventType: "REAUTHENTICATION",
      outcome: valid ? "SUCCESS" : "FAILURE",
      method: "PASSWORD",
      occurredAt: now,
      metadata: { purpose: "mfa_enrollment" },
    },
  });
  if (!valid) return null;
  return { organizationId: context.organizationId, userId: context.userId };
}
