import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePlatformAuthorization, type PlatformAuthorizationContext } from "@/lib/platform/authorization";

export type HelpSupportQueueStatus = "OPEN" | "ACKNOWLEDGED" | "CLOSED";
export type HelpSupportQueueRecord = {
  id: string;
  organizationId: string;
  organizationName: string;
  submittedByUserId: string;
  submittedByName: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: HelpSupportQueueStatus;
  applicationVersion: string | null;
  pageContext: string | null;
  browserFamily: string | null;
  correlationId: string | null;
  submittedAt: Date;
  acknowledgedAt: Date | null;
  closedAt: Date | null;
  assignedToIdentityId: string | null;
  assigneeName: string | null;
  assignedAt: Date | null;
  responseDueAt: Date | null;
  closureDueAt: Date | null;
  responseSlaState: "NONE" | "ON_TRACK" | "OVERDUE" | "MET";
  closureSlaState: "NONE" | "ON_TRACK" | "OVERDUE" | "MET";
};

export class HelpSupportQueueService {
  async list(context: PlatformAuthorizationContext, status?: HelpSupportQueueStatus): Promise<HelpSupportQueueRecord[]> {
    requirePlatformAuthorization(context, { permission: "platform.support.request" });
    return db.$queryRaw<HelpSupportQueueRecord[]>(Prisma.sql`
      SELECT h."id", h."organizationId", o."displayName" AS "organizationName",
             h."submittedByUserId", CONCAT_WS(' ', u."firstName", u."lastName") AS "submittedByName",
             h."subject", h."description", h."category", h."priority", h."status"::text AS "status",
             h."applicationVersion", h."pageContext", h."browserFamily", h."correlationId",
             h."submittedAt", h."acknowledgedAt", h."closedAt",
             h."assignedToIdentityId", CONCAT_WS(' ', au."firstName", au."lastName") AS "assigneeName",
             h."assignedAt", h."responseDueAt", h."closureDueAt",
             CASE
               WHEN h."responseDueAt" IS NULL THEN 'NONE'
               WHEN h."acknowledgedAt" IS NOT NULL THEN 'MET'
               WHEN h."responseDueAt" < CURRENT_TIMESTAMP THEN 'OVERDUE'
               ELSE 'ON_TRACK'
             END AS "responseSlaState",
             CASE
               WHEN h."closureDueAt" IS NULL THEN 'NONE'
               WHEN h."closedAt" IS NOT NULL THEN 'MET'
               WHEN h."closureDueAt" < CURRENT_TIMESTAMP THEN 'OVERDUE'
               ELSE 'ON_TRACK'
             END AS "closureSlaState"
      FROM "HelpSupportRequest" h
      INNER JOIN "Organization" o ON o."id" = h."organizationId"
      INNER JOIN "User" u ON u."id" = h."submittedByUserId"
      LEFT JOIN "PlatformIdentity" api ON api."id" = h."assignedToIdentityId"
      LEFT JOIN "User" au ON au."id" = api."sourceUserId"
      WHERE (${status ?? null}::text IS NULL OR h."status"::text = ${status ?? null})
      ORDER BY CASE h."priority" WHEN 'HIGH' THEN 0 WHEN 'NORMAL' THEN 1 ELSE 2 END,
               h."submittedAt" ASC, h."id"
    `);
  }

  async listAssignableOwners(context: PlatformAuthorizationContext): Promise<Array<{ platformIdentityId: string; displayName: string }>> {
    requirePlatformAuthorization(context, { permission: "platform.support.request" });
    return db.$queryRaw(Prisma.sql`
      SELECT pi."id" AS "platformIdentityId", CONCAT_WS(' ', u."firstName", u."lastName") AS "displayName"
      FROM "PlatformIdentity" pi
      INNER JOIN "PlatformMembership" pm ON pm."identityId" = pi."id"
      INNER JOIN "User" u ON u."id" = pi."sourceUserId"
      WHERE pi."status" = 'ACTIVE' AND pm."status" = 'ACTIVE'
        AND EXISTS (
          SELECT 1 FROM "PlatformMembershipRole" pmr
          INNER JOIN "PlatformRolePermission" prp ON prp."roleId" = pmr."roleId"
          INNER JOIN "PlatformPermission" pp ON pp."id" = prp."permissionId"
          WHERE pmr."membershipId" = pm."id" AND pp."key" = 'platform.support.request'
        )
      ORDER BY u."lastName", u."firstName", pi."id"
    `);
  }

  async assign(
    context: PlatformAuthorizationContext,
    requestId: string,
    input: { assignedToIdentityId: string; responseDueAt?: string | null; closureDueAt?: string | null; reason: string },
  ): Promise<void> {
    requirePlatformAuthorization(context, { permission: "platform.support.request" });
    validateReason(input.reason);
    const responseDueAt = parseFutureDueAt(input.responseDueAt, "responseDueAt");
    const closureDueAt = parseFutureDueAt(input.closureDueAt, "closureDueAt");
    if (responseDueAt && closureDueAt && closureDueAt < responseDueAt) {
      throw new HelpSupportQueueValidationError("Closure due time cannot be earlier than response due time");
    }
    await db.$transaction(async (tx) => {
      const owners = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT pi."id"
        FROM "PlatformIdentity" pi
        INNER JOIN "PlatformMembership" pm ON pm."identityId" = pi."id"
        WHERE pi."id" = ${input.assignedToIdentityId}::uuid
          AND pi."status" = 'ACTIVE' AND pm."status" = 'ACTIVE'
          AND EXISTS (
            SELECT 1 FROM "PlatformMembershipRole" pmr
            INNER JOIN "PlatformRolePermission" prp ON prp."roleId" = pmr."roleId"
            INNER JOIN "PlatformPermission" pp ON pp."id" = prp."permissionId"
            WHERE pmr."membershipId" = pm."id" AND pp."key" = 'platform.support.request'
          )
      `);
      if (owners.length !== 1) throw new HelpSupportQueueValidationError("Assignee must be an active platform support member");
      const changed = await tx.$executeRaw(Prisma.sql`
        UPDATE "HelpSupportRequest"
        SET "assignedToIdentityId"=${input.assignedToIdentityId}::uuid,
            "assignedAt"=CURRENT_TIMESTAMP,
            "responseDueAt"=${responseDueAt},
            "closureDueAt"=${closureDueAt}
        WHERE "id"=${requestId}::uuid AND "status" <> 'CLOSED'
      `);
      if (changed !== 1) throw new HelpSupportQueueConflictError("Only active support requests can be assigned");
      await writeAudit(tx, context, "help_support_request.assigned", requestId, input.reason, {
        assignedToIdentityId: input.assignedToIdentityId,
        responseDueAt: responseDueAt?.toISOString() ?? null,
        closureDueAt: closureDueAt?.toISOString() ?? null,
      });
    });
  }

  async acknowledge(context: PlatformAuthorizationContext, requestId: string, reason: string): Promise<void> {
    requirePlatformAuthorization(context, { permission: "platform.support.request" });
    validateReason(reason);
    await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; organizationId: string; submittedByUserId: string; subject: string }>>(Prisma.sql`
        UPDATE "HelpSupportRequest"
        SET "status" = 'ACKNOWLEDGED', "acknowledgedAt" = COALESCE("acknowledgedAt", CURRENT_TIMESTAMP)
        WHERE "id" = ${requestId}::uuid AND "status" = 'OPEN'
        RETURNING "id","organizationId","submittedByUserId","subject"
      `);
      const row = rows[0];
      if (!row) throw new HelpSupportQueueConflictError("Only open support requests can be acknowledged");
      await enqueueCustomerStatusNotification(tx, row, "ACKNOWLEDGED");
      await writeAudit(tx, context, "help_support_request.acknowledged", requestId, reason);
    });
  }

  async close(context: PlatformAuthorizationContext, requestId: string, reason: string): Promise<void> {
    requirePlatformAuthorization(context, { permission: "platform.support.request" });
    validateReason(reason);
    await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; organizationId: string; submittedByUserId: string; subject: string }>>(Prisma.sql`
        UPDATE "HelpSupportRequest"
        SET "status" = 'CLOSED', "closedAt" = CURRENT_TIMESTAMP,
            "acknowledgedAt" = COALESCE("acknowledgedAt", CURRENT_TIMESTAMP)
        WHERE "id" = ${requestId}::uuid AND "status" IN ('OPEN', 'ACKNOWLEDGED')
        RETURNING "id","organizationId","submittedByUserId","subject"
      `);
      const row = rows[0];
      if (!row) throw new HelpSupportQueueConflictError("Support request is already closed or was not found");
      await enqueueCustomerStatusNotification(tx, row, "CLOSED");
      await writeAudit(tx, context, "help_support_request.closed", requestId, reason);
    });
  }
}

async function enqueueCustomerStatusNotification(
  tx: Prisma.TransactionClient,
  request: { id: string; organizationId: string; submittedByUserId: string; subject: string },
  status: "ACKNOWLEDGED" | "CLOSED",
) {
  await tx.notificationOutbox.create({
    data: {
      organizationId: request.organizationId,
      recipientUserId: request.submittedByUserId,
      channel: "IN_APP",
      eventKey: `help-support-request:${request.id}:status:${status.toLowerCase()}`,
      templateKey: status === "ACKNOWLEDGED" ? "HELP_SUPPORT_ACKNOWLEDGED" : "HELP_SUPPORT_CLOSED",
      payload: {
        supportRequestId: request.id,
        reference: request.id.slice(0, 8),
        subject: request.subject,
        status,
        helpPath: "/help",
      },
    },
  });
}

async function writeAudit(tx: Prisma.TransactionClient, context: PlatformAuthorizationContext, action: string, requestId: string, reason: string, extraMetadata: Prisma.InputJsonObject = {}) {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "PlatformAuditEvent" ("id","actorIdentityId","actorMembershipId","action","entityType","entityId","reason","metadata")
    SELECT gen_random_uuid(), ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid,
           ${action}, 'HelpSupportRequest', h."id", ${reason.trim()},
           jsonb_build_object('targetOrganizationId', h."organizationId", 'status', h."status") || ${JSON.stringify(extraMetadata)}::jsonb
    FROM "HelpSupportRequest" h WHERE h."id" = ${requestId}::uuid
  `);
}

function parseFutureDueAt(value: string | null | undefined, field: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now()) {
    throw new HelpSupportQueueValidationError(`${field} must be a future timestamp`);
  }
  return parsed;
}

function validateReason(reason: string) {
  if (!reason.trim() || reason.length > 1000) throw new HelpSupportQueueValidationError("A reason between 1 and 1000 characters is required");
}

export class HelpSupportQueueValidationError extends Error {
  constructor(message: string) { super(message); this.name = "HelpSupportQueueValidationError"; }
}
export class HelpSupportQueueConflictError extends Error {
  constructor(message: string) { super(message); this.name = "HelpSupportQueueConflictError"; }
}
