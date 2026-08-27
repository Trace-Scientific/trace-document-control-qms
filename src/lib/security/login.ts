import { db } from "../db";
import { generateOpaqueToken, hashOpaqueToken, verifyPassword } from "./crypto";

const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const IDLE_MS = 30 * 60 * 1000;
const ABSOLUTE_MS = 12 * 60 * 60 * 1000;

export class LoginRejectedError extends Error {
  constructor(public readonly throttled = false) {
    super("Sign-in failed");
    this.name = "LoginRejectedError";
  }
}

export async function login(input: {
  organizationCode: string;
  email: string;
  password: string;
  ipAddressHash?: string;
  userAgentHash?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const organization = await db.organization.findUnique({
    where: { loginCode: input.organizationCode.toLowerCase() },
  });
  if (!organization?.active) throw new LoginRejectedError();

  const user = await db.user.findUnique({
    where: {
      organizationId_email: {
        organizationId: organization.id,
        email: input.email.trim().toLowerCase(),
      },
    },
    include: { credential: true },
  });

  const commonEvent = {
    organizationId: organization.id,
    userId: user?.id,
    method: "PASSWORD" as const,
    ipAddressHash: input.ipAddressHash,
    userAgentHash: input.userAgentHash,
  };
  const recentFailures = user
    ? await db.authenticationEvent.count({
        where: {
          organizationId: organization.id,
          userId: user.id,
          eventType: "LOGIN_FAILURE",
          occurredAt: { gte: new Date(now.getTime() - FAILURE_WINDOW_MS) },
        },
      })
    : 0;

  if (recentFailures >= MAX_FAILURES) {
    await db.authenticationEvent.create({
      data: { ...commonEvent, eventType: "LOGIN_FAILURE", outcome: "FAILURE", occurredAt: now, metadata: { reason: "throttled" } },
    });
    throw new LoginRejectedError(true);
  }

  if (!user || user.status !== "ACTIVE" || !user.credential || user.credential.disabledAt || !verifyPassword(input.password, user.credential.passwordHash)) {
    await db.authenticationEvent.create({
      data: { ...commonEvent, eventType: "LOGIN_FAILURE", outcome: "FAILURE", occurredAt: now, metadata: { reason: "invalid_credentials" } },
    });
    throw new LoginRejectedError();
  }

  const token = generateOpaqueToken();
  const absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_MS);
  await db.$transaction(async (transaction) => {
    const event = await transaction.authenticationEvent.create({
      data: { ...commonEvent, userId: user.id, eventType: "LOGIN", outcome: "SUCCESS", occurredAt: now, validUntil: absoluteExpiresAt },
    });
    await transaction.session.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        authenticationEventId: event.id,
        tokenHash: hashOpaqueToken(token),
        createdAt: now,
        lastSeenAt: now,
        idleExpiresAt: new Date(now.getTime() + IDLE_MS),
        absoluteExpiresAt,
      },
    });
    await transaction.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
  });

  return { token, absoluteExpiresAt, user: { id: user.id, firstName: user.firstName, lastName: user.lastName } };
}

