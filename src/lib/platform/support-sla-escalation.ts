import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePlatformAuthorization, type PlatformAuthorizationContext } from "@/lib/platform/authorization";

type OverdueSupportSla = {
  id: string;
  organizationId: string;
  subject: string;
  assignedToIdentityId: string;
  responseDueAt: Date | null;
  closureDueAt: Date | null;
  responseOverdue: boolean;
  closureOverdue: boolean;
};

export class SupportSlaEscalationService {
  async scan(context: PlatformAuthorizationContext) {
    requirePlatformAuthorization(context, { permission: "platform.support.request" });
    return db.$transaction(async (tx) => {
      const overdue = await tx.$queryRaw<OverdueSupportSla[]>(Prisma.sql`
        SELECT
          h."id", h."organizationId", h."subject", h."assignedToIdentityId",
          h."responseDueAt", h."closureDueAt",
          (h."status" = 'OPEN' AND h."responseDueAt" IS NOT NULL AND h."responseDueAt" < CURRENT_TIMESTAMP) AS "responseOverdue",
          (h."status" <> 'CLOSED' AND h."closureDueAt" IS NOT NULL AND h."closureDueAt" < CURRENT_TIMESTAMP) AS "closureOverdue"
        FROM "HelpSupportRequest" h
        WHERE h."assignedToIdentityId" IS NOT NULL
          AND (
            (h."status" = 'OPEN' AND h."responseDueAt" IS NOT NULL AND h."responseDueAt" < CURRENT_TIMESTAMP)
            OR
            (h."status" <> 'CLOSED' AND h."closureDueAt" IS NOT NULL AND h."closureDueAt" < CURRENT_TIMESTAMP)
          )
        ORDER BY COALESCE(h."responseDueAt", h."closureDueAt"), h."id"
      `);

      let created = 0;
      for (const item of overdue) {
        if (item.responseOverdue) {
          created += await enqueueEscalation(tx, item, "RESPONSE");
        }
        if (item.closureOverdue) {
          created += await enqueueEscalation(tx, item, "CLOSURE");
        }
      }

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PlatformAuditEvent" (
          "id","actorIdentityId","actorMembershipId","action","entityType","entityId","reason","metadata"
        )
        VALUES (
          gen_random_uuid(), ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid,
          'help_support_sla.scan', 'PlatformOperation', gen_random_uuid(),
          'Support SLA overdue scan',
          ${JSON.stringify({ evaluated: overdue.length, notificationsCreated: created })}::jsonb
        )
      `);

      return { evaluated: overdue.length, notificationsCreated: created };
    });
  }
}

async function enqueueEscalation(
  tx: Prisma.TransactionClient,
  item: OverdueSupportSla,
  milestone: "RESPONSE" | "CLOSURE",
) {
  const dueAt = milestone === "RESPONSE" ? item.responseDueAt : item.closureDueAt;
  const notificationType = milestone === "RESPONSE" ? "SUPPORT_RESPONSE_SLA_OVERDUE" : "SUPPORT_CLOSURE_SLA_OVERDUE";
  const subject = milestone === "RESPONSE" ? "Support response SLA overdue" : "Support closure SLA overdue";
  const dedupeKey = `help-support-sla:${item.id}:${milestone.toLowerCase()}:overdue`;

  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO "PlatformNotification" (
      "id","notificationType","subject","body","payload","recipientIdentityId","channel","status","dedupeKey","availableAt","createdAt","updatedAt"
    )
    VALUES (
      gen_random_uuid(), ${notificationType}, ${subject},
      ${`Support request ${item.id.slice(0, 8)} has exceeded its ${milestone.toLowerCase()} target.`},
      ${JSON.stringify({
        supportRequestId: item.id,
        reference: item.id.slice(0, 8),
        milestone,
        dueAt: dueAt?.toISOString() ?? null,
        helpPath: "/platform?section=support",
      })}::jsonb,
      ${item.assignedToIdentityId}::uuid,
      'IN_APP'::"PlatformNotificationChannel",
      'PENDING'::"PlatformNotificationStatus",
      ${dedupeKey},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("dedupeKey") WHERE "dedupeKey" IS NOT NULL DO NOTHING
    RETURNING "id"
  `);

  if (rows[0]) {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "PlatformNotificationEvent" (
        "id","notificationId","action","metadata"
      ) VALUES (
        gen_random_uuid(), ${rows[0].id}::uuid, 'CREATED',
        ${JSON.stringify({ source: "support_sla_escalation", milestone, supportRequestId: item.id })}::jsonb
      )
    `);
    return 1;
  }
  return 0;
}
