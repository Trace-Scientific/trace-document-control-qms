import type { NextRequest } from "next/server";
import { db } from "../db";
import { verifyPassword } from "./crypto";
import { authenticateRequest } from "./authenticated-request";

// Enrollment is a sensitive account change. Require a valid tenant-scoped
// session AND a fresh password check; possession of a session alone is not enough.
// Never accept organizationId/userId from the request body.
export async function reauthenticateForMfaEnrollment(
  request: NextRequest,
  password: string,
): Promise<{ organizationId: string; userId: string } | null> {
  if (typeof password !== "string" || password.length < 1 || password.length > 1024) return null;
  const context = await authenticateRequest(request);
  const user = await db.user.findUnique({
    where: { id: context.userId },
    select: {
      id: true, organizationId: true, status: true, mfaEnabled: true,
      organization: { select: { active: true } },
      credential: { select: { passwordHash: true, disabledAt: true } },
    },
  });
  if (!user || user.organizationId !== context.organizationId ||
      user.status !== "ACTIVE" || !user.organization.active ||
      user.mfaEnabled || !user.credential || user.credential.disabledAt ||
      !verifyPassword(password, user.credential.passwordHash)) return null;
  return { organizationId: context.organizationId, userId: context.userId };
}
