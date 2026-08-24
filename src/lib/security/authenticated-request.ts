import type { NextRequest } from "next/server";
import { db } from "../db";
import { hashOpaqueToken } from "./crypto";
import { nextIdleExpiration, validateSession } from "./session";
import type { AuthorizationContext } from "./authorization";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export async function authenticateRequest(request: NextRequest): Promise<AuthorizationContext> {
  const token = request.cookies.get("qms_session")?.value;
  if (!token) throw new AuthenticationRequiredError();

  const record = await db.session.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
    include: {
      user: {
        include: {
          roles: {
            include: {
              role: {
                include: {
                  permissions: { include: { permission: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!record) throw new AuthenticationRequiredError();

  const now = new Date();
  const validation = validateSession(token, record, now);
  if (!validation.valid || record.user.status !== "ACTIVE") {
    throw new AuthenticationRequiredError();
  }

  await db.session.updateMany({
    where: { id: record.id, organizationId: record.organizationId, revokedAt: null },
    data: {
      lastSeenAt: now,
      idleExpiresAt: nextIdleExpiration(now, record.absoluteExpiresAt, IDLE_TIMEOUT_MS),
    },
  });

  return {
    userId: record.userId,
    organizationId: record.organizationId,
    userState: "ACTIVE",
    grants: record.user.roles.flatMap(({ role }) =>
      role.permissions.map(({ permission }) => ({
        permission: permission.key,
        scopeType: "ORGANIZATION" as const,
        scopeId: null,
      })),
    ),
  };
}

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "AuthenticationRequiredError";
  }
}
