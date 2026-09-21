import { Prisma } from "@prisma/client";
import { db } from "../db";
import type { PlatformAuthorizationContext } from "./authorization";
import { requirePlatformAuthorization } from "./authorization";

export type PlatformNotificationChannel = "IN_APP" | "EMAIL";
export type PlatformNotificationStatus = "PENDING" | "PROCESSING" | "RETRY" | "SENT" | "DEAD_LETTER";

export interface PlatformNotificationRecord {
  id: string;
  notificationType: string;
  subject: string;
  body: string;
  payload: unknown;
  recipientIdentityId: string;
  customerAccountId: string | null;
  channel: PlatformNotificationChannel;
  status: PlatformNotificationStatus;
  attempts: number;
  availableAt: Date;
  lastAttemptAt: Date | null;
  sentAt: Date | null;
  deadLetteredAt: Date | null;
  lastError: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface ClaimedPlatformNotification extends PlatformNotificationRecord {
  claimedAt: Date;
  claimedBy: string;
}

export interface PlatformOperationalReport {
  generatedAt: string;
  customers: { total: number; byStatus: Record<string, number> };
  subscriptions: { total: number; byStatus: Record<string, number> };
  entitlements: { activeOverrides: number; enableOverrides: number; disableOverrides: number };
  support: {
    casesByStatus: Record<string, number>;
    requestsByStatus: Record<string, number>;
    sessionsByStatus: Record<string, number>;
    activeUnexpiredSessions: number;
    customerHelpRequestsByStatus: Record<string, number>;
    overdueResponseSla: number;
    overdueClosureSla: number;
    unassignedActiveRequests: number;
  };
  sales: { representativesByStatus: Record<string, number>; currentAssignments: number };
  commissions: { accrualsByStatus: Record<string, number>; unpaidApprovedAmount: string };
  notifications: { byStatus: Record<string, number>; deadLetterCount: number; retryCount: number };
}

export class PlatformNotificationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformNotificationValidationError";
  }
}

export class PlatformNotificationNotFoundError extends Error {
  constructor(message = "Platform notification not found") {
    super(message);
    this.name = "PlatformNotificationNotFoundError";
  }
}

export class PlatformNotificationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformNotificationConflictError";
  }
}

const RETRY_SECONDS = [60, 300, 900, 3600, 14400] as const;
const MAX_ATTEMPTS = 5;
const CLAIM_LEASE_MINUTES = 5;

function requireText(value: string, label: string, max = 1000) {
  const normalized = value.trim();
  if (!normalized) throw new PlatformNotificationValidationError(`${label} is required`);
  if (normalized.length > max) throw new PlatformNotificationValidationError(`${label} is too long`);
  return normalized;
}

function statusMap(rows: Array<{ status: string; count: bigint }>) {
  return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
}

async function appendEvent(
  tx: Prisma.TransactionClient,
  notificationId: string,
  action: string,
  input: {
    actorIdentityId?: string | null;
    actorMembershipId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  } = {},
) {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "PlatformNotificationEvent" (
      "id", "notificationId", "action", "actorIdentityId", "actorMembershipId", "reason", "metadata"
    ) VALUES (
      gen_random_uuid(), ${notificationId}::uuid, ${action},
      ${input.actorIdentityId ?? null}::uuid, ${input.actorMembershipId ?? null}::uuid,
      ${input.reason ?? null}, ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
  `);
}

async function appendAudit(
  tx: Prisma.TransactionClient,
  context: PlatformAuthorizationContext,
  action: string,
  entityType: string,
  entityId: string,
  reason: string,
  metadata: Record<string, unknown> = {},
) {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "PlatformAuditEvent" (
      "id", "actorIdentityId", "actorMembershipId", "action", "entityType", "entityId", "reason", "metadata"
    ) VALUES (
      gen_random_uuid(), ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid,
      ${action}, ${entityType}, ${entityId}::uuid, ${reason}, ${JSON.stringify(metadata)}::jsonb
    )
  `);
}

export class PlatformNotificationReportingService {
  async listInbox(context: PlatformAuthorizationContext): Promise<PlatformNotificationRecord[]> {
    requirePlatformAuthorization(context, { permission: "platform.notification.read" });
    return db.$queryRaw<PlatformNotificationRecord[]>(Prisma.sql`
      SELECT "id", "notificationType", "subject", "body", "payload", "recipientIdentityId", "customerAccountId",
             "channel"::text AS "channel", "status"::text AS "status", "attempts", "availableAt", "lastAttemptAt",
             "sentAt", "deadLetteredAt", "lastError", "readAt", "createdAt"
      FROM "PlatformNotification"
      WHERE "recipientIdentityId" = ${context.platformIdentityId}::uuid
        AND "channel" = 'IN_APP'
        AND "status" = 'SENT'
      ORDER BY "createdAt" DESC
      LIMIT 200
    `);
  }

  async markRead(context: PlatformAuthorizationContext, notificationId: string) {
    requirePlatformAuthorization(context, { permission: "platform.notification.read" });
    return db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; readAt: Date }>>(Prisma.sql`
        UPDATE "PlatformNotification"
        SET "readAt" = COALESCE("readAt", CURRENT_TIMESTAMP), "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${notificationId}::uuid
          AND "recipientIdentityId" = ${context.platformIdentityId}::uuid
          AND "channel" = 'IN_APP'
          AND "status" = 'SENT'
        RETURNING "id", "readAt"
      `);
      if (rows.length !== 1) throw new PlatformNotificationNotFoundError();
      await appendEvent(tx, notificationId, "READ", {
        actorIdentityId: context.platformIdentityId,
        actorMembershipId: context.platformMembershipId,
      });
      return rows[0];
    });
  }

  async enqueue(
    context: PlatformAuthorizationContext,
    input: {
      notificationType: string;
      subject: string;
      body: string;
      recipientIdentityId: string;
      customerAccountId?: string | null;
      channel?: PlatformNotificationChannel;
      dedupeKey?: string | null;
      payload?: Record<string, unknown>;
      reason: string;
    },
  ) {
    requirePlatformAuthorization(context, { permission: "platform.notification.manage" });
    const notificationType = requireText(input.notificationType, "Notification type", 160);
    const subject = requireText(input.subject, "Subject", 240);
    const body = requireText(input.body, "Body", 10000);
    const reason = requireText(input.reason, "Reason", 1000);
    const channel = input.channel ?? "IN_APP";
    if (!(["IN_APP", "EMAIL"] as const).includes(channel)) {
      throw new PlatformNotificationValidationError("Unsupported notification channel");
    }

    return db.$transaction(async (tx) => {
      const recipients = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT pi."id"
        FROM "PlatformIdentity" pi
        INNER JOIN "PlatformMembership" pm ON pm."identityId" = pi."id"
        WHERE pi."id" = ${input.recipientIdentityId}::uuid
          AND pi."status" = 'ACTIVE'
          AND pm."status" = 'ACTIVE'
        LIMIT 1
      `);
      if (recipients.length !== 1) {
        throw new PlatformNotificationValidationError("Recipient must have an active platform identity and membership");
      }

      if (input.customerAccountId) {
        const customers = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "CustomerAccount" WHERE "id" = ${input.customerAccountId}::uuid LIMIT 1
        `);
        if (customers.length !== 1) throw new PlatformNotificationValidationError("Customer account does not exist");
      }

      const rows = await tx.$queryRaw<Array<{ id: string; status: PlatformNotificationStatus }>>(Prisma.sql`
        INSERT INTO "PlatformNotification" (
          "id", "notificationType", "subject", "body", "payload", "recipientIdentityId", "customerAccountId", "channel", "dedupeKey"
        ) VALUES (
          gen_random_uuid(), ${notificationType}, ${subject}, ${body}, ${JSON.stringify(input.payload ?? {})}::jsonb,
          ${input.recipientIdentityId}::uuid, ${input.customerAccountId ?? null}::uuid,
          ${channel}::"PlatformNotificationChannel", ${input.dedupeKey?.trim() || null}
        )
        RETURNING "id", "status"::text AS "status"
      `);
      await appendEvent(tx, rows[0].id, "CREATED", {
        actorIdentityId: context.platformIdentityId,
        actorMembershipId: context.platformMembershipId,
        reason,
        metadata: { channel, notificationType },
      });
      await appendAudit(tx, context, "platform.notification.created", "PlatformNotification", rows[0].id, reason, {
        recipientIdentityId: input.recipientIdentityId,
        customerAccountId: input.customerAccountId ?? null,
        channel,
        notificationType,
      });
      return rows[0];
    });
  }

  async listDeliveryMonitor(
    context: PlatformAuthorizationContext,
    status?: PlatformNotificationStatus | null,
  ): Promise<PlatformNotificationRecord[]> {
    requirePlatformAuthorization(context, { permission: "platform.notification.manage" });
    return db.$queryRaw<PlatformNotificationRecord[]>(Prisma.sql`
      SELECT "id", "notificationType", "subject", "body", "payload", "recipientIdentityId", "customerAccountId",
             "channel"::text AS "channel", "status"::text AS "status", "attempts", "availableAt", "lastAttemptAt",
             "sentAt", "deadLetteredAt", "lastError", "readAt", "createdAt"
      FROM "PlatformNotification"
      WHERE (${status ?? null}::text IS NULL OR "status"::text = ${status ?? null})
      ORDER BY "createdAt" DESC
      LIMIT 250
    `);
  }

  async requeueDeadLetter(
    context: PlatformAuthorizationContext,
    notificationId: string,
    reasonInput: string,
  ) {
    requirePlatformAuthorization(context, { permission: "platform.notification.manage" });
    const reason = requireText(reasonInput, "Reason", 1000);
    return db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: PlatformNotificationStatus }>>(Prisma.sql`
        UPDATE "PlatformNotification"
        SET "status" = 'PENDING', "attempts" = 0, "availableAt" = CURRENT_TIMESTAMP,
            "claimedAt" = NULL, "claimedBy" = NULL, "lastAttemptAt" = NULL,
            "sentAt" = NULL, "deadLetteredAt" = NULL, "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${notificationId}::uuid AND "status" = 'DEAD_LETTER'
        RETURNING "id", "status"::text AS "status"
      `);
      if (rows.length !== 1) throw new PlatformNotificationConflictError("Only dead-letter notifications can be requeued");
      await appendEvent(tx, notificationId, "REQUEUED", {
        actorIdentityId: context.platformIdentityId,
        actorMembershipId: context.platformMembershipId,
        reason,
      });
      await appendAudit(tx, context, "platform.notification.requeued", "PlatformNotification", notificationId, reason);
      return rows[0];
    });
  }

  async claimDeliveryBatch(workerIdInput: string, limit = 25): Promise<ClaimedPlatformNotification[]> {
    const workerId = requireText(workerIdInput, "Worker id", 160);
    const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));

    return db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "PlatformNotification"
        SET "status" = 'RETRY', "claimedAt" = NULL, "claimedBy" = NULL,
            "availableAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP,
            "lastError" = COALESCE("lastError", 'Recovered abandoned delivery lease')
        WHERE "status" = 'PROCESSING'
          AND "claimedAt" < CURRENT_TIMESTAMP - (${CLAIM_LEASE_MINUTES} * INTERVAL '1 minute')
      `);

      return tx.$queryRaw<ClaimedPlatformNotification[]>(Prisma.sql`
        WITH candidates AS (
          SELECT "id"
          FROM "PlatformNotification"
          WHERE "status" IN ('PENDING', 'RETRY')
            AND "availableAt" <= CURRENT_TIMESTAMP
            AND "attempts" < ${MAX_ATTEMPTS}
          ORDER BY "availableAt", "createdAt"
          FOR UPDATE SKIP LOCKED
          LIMIT ${boundedLimit}
        )
        UPDATE "PlatformNotification" n
        SET "status" = 'PROCESSING', "claimedAt" = CURRENT_TIMESTAMP, "claimedBy" = ${workerId}, "updatedAt" = CURRENT_TIMESTAMP
        FROM candidates c
        WHERE n."id" = c."id"
        RETURNING n."id", n."notificationType", n."subject", n."body", n."payload", n."recipientIdentityId",
                  n."customerAccountId", n."channel"::text AS "channel", n."status"::text AS "status", n."attempts",
                  n."availableAt", n."lastAttemptAt", n."sentAt", n."deadLetteredAt", n."lastError", n."readAt",
                  n."createdAt", n."claimedAt", n."claimedBy"
      `);
    });
  }

  async markDelivered(notificationId: string, workerIdInput: string) {
    const workerId = requireText(workerIdInput, "Worker id", 160);
    return db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; attempts: number }>>(Prisma.sql`
        UPDATE "PlatformNotification"
        SET "status" = 'SENT', "attempts" = "attempts" + 1, "sentAt" = CURRENT_TIMESTAMP,
            "lastAttemptAt" = CURRENT_TIMESTAMP, "claimedAt" = NULL, "claimedBy" = NULL,
            "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${notificationId}::uuid AND "status" = 'PROCESSING' AND "claimedBy" = ${workerId}
        RETURNING "id", "attempts"
      `);
      if (rows.length !== 1) throw new PlatformNotificationConflictError("Notification is not claimed by this worker");
      await appendEvent(tx, notificationId, "SENT", { metadata: { workerId, attempts: rows[0].attempts } });
      return rows[0];
    });
  }

  async markDeliveryFailed(notificationId: string, workerIdInput: string, errorInput: string) {
    const workerId = requireText(workerIdInput, "Worker id", 160);
    const errorMessage = requireText(errorInput, "Delivery error", 1000);
    return db.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<Array<{ id: string; attempts: number }>>(Prisma.sql`
        SELECT "id", "attempts" FROM "PlatformNotification"
        WHERE "id" = ${notificationId}::uuid AND "status" = 'PROCESSING' AND "claimedBy" = ${workerId}
        FOR UPDATE
      `);
      if (claimed.length !== 1) throw new PlatformNotificationConflictError("Notification is not claimed by this worker");
      const attempts = claimed[0].attempts + 1;
      const deadLetter = attempts >= MAX_ATTEMPTS;
      const delay = RETRY_SECONDS[Math.min(attempts - 1, RETRY_SECONDS.length - 1)];
      const availableAt = new Date(Date.now() + delay * 1000);
      const deadLetteredAt = deadLetter ? new Date() : null;

      const rows = await tx.$queryRaw<Array<{ id: string; status: PlatformNotificationStatus; attempts: number }>>(Prisma.sql`
        UPDATE "PlatformNotification"
        SET "status" = ${deadLetter ? "DEAD_LETTER" : "RETRY"}::"PlatformNotificationStatus",
            "attempts" = ${attempts},
            "availableAt" = ${deadLetter ? new Date() : availableAt},
            "claimedAt" = NULL, "claimedBy" = NULL,
            "lastAttemptAt" = CURRENT_TIMESTAMP,
            "deadLetteredAt" = ${deadLetteredAt},
            "lastError" = ${errorMessage}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${notificationId}::uuid
        RETURNING "id", "status"::text AS "status", "attempts"
      `);
      await appendEvent(tx, notificationId, deadLetter ? "DEAD_LETTER" : "DELIVERY_FAILED", {
        metadata: { workerId, attempts, retryDelaySeconds: deadLetter ? 0 : delay },
      });
      return rows[0];
    });
  }

  async generateOperationalReport(context: PlatformAuthorizationContext) {
    requirePlatformAuthorization(context, { permission: "platform.reporting.read" });
    return db.$transaction(async (tx) => {
      const customerRows = await tx.$queryRaw<Array<{ status: string; count: bigint }>>(Prisma.sql`
        SELECT "status"::text AS "status", COUNT(*)::bigint AS "count" FROM "CustomerAccount" GROUP BY "status" ORDER BY "status"
      `);
      const subscriptionRows = await tx.$queryRaw<Array<{ status: string; count: bigint }>>(Prisma.sql`
        SELECT "status"::text AS "status", COUNT(*)::bigint AS "count" FROM "Subscription" GROUP BY "status" ORDER BY "status"
      `);
      const overrideRows = await tx.$queryRaw<Array<{ decision: string; count: bigint }>>(Prisma.sql`
        SELECT "decision"::text AS "decision", COUNT(*)::bigint AS "count"
        FROM "EntitlementOverride"
        WHERE "revokedAt" IS NULL AND "effectiveFrom" <= CURRENT_TIMESTAMP AND ("effectiveTo" IS NULL OR "effectiveTo" > CURRENT_TIMESTAMP)
        GROUP BY "decision"
      `);
      const supportCaseRows = await tx.$queryRaw<Array<{ status: string; count: bigint }>>(Prisma.sql`
        SELECT "status"::text AS "status", COUNT(*)::bigint AS "count" FROM "SupportCase" GROUP BY "status" ORDER BY "status"
      `);
      const supportRequestRows = await tx.$queryRaw<Array<{ status: string; count: bigint }>>(Prisma.sql`
        SELECT "status"::text AS "status", COUNT(*)::bigint AS "count" FROM "SupportAccessRequest" GROUP BY "status" ORDER BY "status"
      `);
      const supportSessionRows = await tx.$queryRaw<Array<{ status: string; count: bigint }>>(Prisma.sql`
        SELECT "status"::text AS "status", COUNT(*)::bigint AS "count" FROM "SupportSession" GROUP BY "status" ORDER BY "status"
      `);
      const activeSupportRows = await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "count" FROM "SupportSession" WHERE "status" = 'ACTIVE' AND "expiresAt" > CURRENT_TIMESTAMP
      `);
      const customerHelpRows = await tx.$queryRaw<Array<{ status: string; count: bigint }>>(Prisma.sql`
        SELECT "status"::text AS "status", COUNT(*)::bigint AS "count"
        FROM "HelpSupportRequest" GROUP BY "status" ORDER BY "status"
      `);
      const supportSlaRows = await tx.$queryRaw<Array<{ overdueResponse: bigint; overdueClosure: bigint; unassignedActive: bigint }>>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (
            WHERE "status"='OPEN' AND "responseDueAt" IS NOT NULL AND "responseDueAt" < CURRENT_TIMESTAMP
          )::bigint AS "overdueResponse",
          COUNT(*) FILTER (
            WHERE "status"<>'CLOSED' AND "closureDueAt" IS NOT NULL AND "closureDueAt" < CURRENT_TIMESTAMP
          )::bigint AS "overdueClosure",
          COUNT(*) FILTER (
            WHERE "status"<>'CLOSED' AND "assignedToIdentityId" IS NULL
          )::bigint AS "unassignedActive"
        FROM "HelpSupportRequest"
      `);
      const salesRepRows = await tx.$queryRaw<Array<{ status: string; count: bigint }>>(Prisma.sql`
        SELECT "status"::text AS "status", COUNT(*)::bigint AS "count" FROM "SalesRepresentative" GROUP BY "status" ORDER BY "status"
      `);
      const salesAssignmentRows = await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "count" FROM "SalesAssignment"
        WHERE "startsAt" <= CURRENT_TIMESTAMP AND ("endsAt" IS NULL OR "endsAt" > CURRENT_TIMESTAMP)
      `);
      const commissionRows = await tx.$queryRaw<Array<{ status: string; count: bigint }>>(Prisma.sql`
        SELECT "status"::text AS "status", COUNT(*)::bigint AS "count" FROM "CommissionAccrual" GROUP BY "status" ORDER BY "status"
      `);
      const approvedAmountRows = await tx.$queryRaw<Array<{ amount: Prisma.Decimal | null }>>(Prisma.sql`
        SELECT SUM("commissionAmount") AS "amount" FROM "CommissionAccrual" WHERE "status" = 'APPROVED'
      `);
      const notificationRows = await tx.$queryRaw<Array<{ status: string; count: bigint }>>(Prisma.sql`
        SELECT "status"::text AS "status", COUNT(*)::bigint AS "count" FROM "PlatformNotification" GROUP BY "status" ORDER BY "status"
      `);

      const customerMap = statusMap(customerRows);
      const subscriptionMap = statusMap(subscriptionRows);
      const supportCaseMap = statusMap(supportCaseRows);
      const supportRequestMap = statusMap(supportRequestRows);
      const supportSessionMap = statusMap(supportSessionRows);
      const customerHelpMap = statusMap(customerHelpRows);
      const supportSla = supportSlaRows[0] ?? { overdueResponse: 0n, overdueClosure: 0n, unassignedActive: 0n };
      const salesRepMap = statusMap(salesRepRows);
      const commissionMap = statusMap(commissionRows);
      const notificationMap = statusMap(notificationRows);
      const overrideMap = Object.fromEntries(overrideRows.map((row) => [row.decision, Number(row.count)]));
      const approvedAmount = approvedAmountRows[0]?.amount;

      const result: PlatformOperationalReport = {
        generatedAt: new Date().toISOString(),
        customers: { total: Object.values(customerMap).reduce((a, b) => a + b, 0), byStatus: customerMap },
        subscriptions: { total: Object.values(subscriptionMap).reduce((a, b) => a + b, 0), byStatus: subscriptionMap },
        entitlements: {
          activeOverrides: overrideRows.reduce((sum, row) => sum + Number(row.count), 0),
          enableOverrides: overrideMap.ENABLE ?? 0,
          disableOverrides: overrideMap.DISABLE ?? 0,
        },
        support: {
          casesByStatus: supportCaseMap,
          requestsByStatus: supportRequestMap,
          sessionsByStatus: supportSessionMap,
          activeUnexpiredSessions: Number(activeSupportRows[0]?.count ?? 0),
          customerHelpRequestsByStatus: customerHelpMap,
          overdueResponseSla: Number(supportSla.overdueResponse),
          overdueClosureSla: Number(supportSla.overdueClosure),
          unassignedActiveRequests: Number(supportSla.unassignedActive),
        },
        sales: {
          representativesByStatus: salesRepMap,
          currentAssignments: Number(salesAssignmentRows[0]?.count ?? 0),
        },
        commissions: {
          accrualsByStatus: commissionMap,
          unpaidApprovedAmount: approvedAmount ? approvedAmount.toFixed(2) : "0.00",
        },
        notifications: {
          byStatus: notificationMap,
          deadLetterCount: notificationMap.DEAD_LETTER ?? 0,
          retryCount: notificationMap.RETRY ?? 0,
        },
      };

      const runs = await tx.$queryRaw<Array<{ id: string; generatedAt: Date }>>(Prisma.sql`
        INSERT INTO "PlatformReportRun" (
          "id", "reportKey", "parameters", "result", "generatedByIdentityId", "generatedByMembershipId"
        ) VALUES (
          gen_random_uuid(), 'platform.operations.commercial.summary', '{}'::jsonb, ${JSON.stringify(result)}::jsonb,
          ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid
        )
        RETURNING "id", "generatedAt"
      `);

      return {
        reportRunId: runs[0].id,
        reportKey: "platform.operations.commercial.summary",
        generatedAt: runs[0].generatedAt,
        result,
      };
    });
  }

  async listRecentReportRuns(context: PlatformAuthorizationContext) {
    requirePlatformAuthorization(context, { permission: "platform.reporting.read" });
    return db.$queryRaw<Array<{ id: string; reportKey: string; parameters: unknown; result: unknown; generatedAt: Date }>>(Prisma.sql`
      SELECT "id", "reportKey", "parameters", "result", "generatedAt"
      FROM "PlatformReportRun"
      ORDER BY "generatedAt" DESC
      LIMIT 50
    `);
  }
}
