import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { TwilioDeliveryMonitoringService } from "./twilio-delivery-monitoring";

const OPERATION_KEY = "twilio.delivery-status.poll";
const LEASE_MINUTES = 10;
const ALERT_PERMISSION = "platform.integration.manage";

function boundedError(value: unknown) {
  const message = value instanceof Error ? value.message : "Twilio scheduled polling failed";
  return message.slice(0, 1000);
}

async function enqueueOperatorAlerts(input: {
  type: string;
  subject: string;
  body: string;
  dedupeSuffix: string;
  payload: Prisma.InputJsonObject;
}) {
  await db.$executeRaw(Prisma.sql`
    WITH inserted AS (
      INSERT INTO "PlatformNotification" (
        "id","notificationType","subject","body","payload","recipientIdentityId","channel","status","dedupeKey","sentAt"
      )
      SELECT
        gen_random_uuid(),${input.type},${input.subject},${input.body},${JSON.stringify(input.payload)}::jsonb,
        pm."identityId",'IN_APP','SENT',
        ${`${OPERATION_KEY}:${input.dedupeSuffix}:`} || pm."identityId"::text,
        CURRENT_TIMESTAMP
      FROM "PlatformMembership" pm
      JOIN "PlatformIdentity" pi ON pi."id"=pm."identityId"
      WHERE pm."status"='ACTIVE' AND pi."status"='ACTIVE'
        AND EXISTS (
          SELECT 1
          FROM "PlatformMembershipRole" pmr
          JOIN "PlatformRolePermission" prp ON prp."roleId"=pmr."roleId"
          JOIN "PlatformPermission" pp ON pp."id"=prp."permissionId"
          WHERE pmr."membershipId"=pm."id" AND pp."key"=${ALERT_PERMISSION}
        )
      ON CONFLICT ("dedupeKey") WHERE "dedupeKey" IS NOT NULL DO NOTHING
      RETURNING "id"
    )
    INSERT INTO "PlatformNotificationEvent" ("id","notificationId","action","reason","metadata")
    SELECT gen_random_uuid(),"id",'SYSTEM_ALERT_CREATED','Scheduled integration monitoring generated this alert.',
           ${JSON.stringify({ operationKey: OPERATION_KEY })}::jsonb
    FROM inserted
  `);
}

export class TwilioMonitoringSchedulerService {
  constructor(private readonly monitoring: TwilioDeliveryMonitoringService) {}

  async runScheduled(limit = 25) {
    const owner = randomUUID();
    const acquired = await db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PlatformScheduledOperationState" ("operationKey")
        VALUES (${OPERATION_KEY})
        ON CONFLICT ("operationKey") DO NOTHING
      `);
      const rows = await tx.$queryRaw<Array<{ operationKey: string }>>(Prisma.sql`
        UPDATE "PlatformScheduledOperationState"
        SET "leaseOwner"=${owner},
            "leaseUntil"=CURRENT_TIMESTAMP + (${LEASE_MINUTES} * INTERVAL '1 minute'),
            "lastStartedAt"=CURRENT_TIMESTAMP,
            "updatedAt"=CURRENT_TIMESTAMP
        WHERE "operationKey"=${OPERATION_KEY}
          AND ("leaseUntil" IS NULL OR "leaseUntil" < CURRENT_TIMESTAMP)
        RETURNING "operationKey"
      `);
      return rows.length === 1;
    });

    if (!acquired) return { skipped: true, reason: "LEASE_ACTIVE" as const };

    try {
      const results = await this.monitoring.pollDue(limit);
      const degraded = results.filter((item) => item.outcome === "POLL_ERROR" || item.outcome.startsWith("HTTP_") || item.outcome === "INVALID_PROVIDER_EVIDENCE");
      await db.$executeRaw(Prisma.sql`
        UPDATE "PlatformScheduledOperationState"
        SET "leaseOwner"=NULL,"leaseUntil"=NULL,
            "lastSucceededAt"=CURRENT_TIMESTAMP,
            "lastError"=NULL,"consecutiveFailures"=0,
            "lastResult"=${JSON.stringify({ polled: results.length, degraded: degraded.length })}::jsonb,
            "updatedAt"=CURRENT_TIMESTAMP
        WHERE "operationKey"=${OPERATION_KEY} AND "leaseOwner"=${owner}
      `);
      if (degraded.length > 0) {
        const bucket = new Date().toISOString().slice(0, 13);
        await enqueueOperatorAlerts({
          type: "INTEGRATION_TWILIO_STATUS_POLL_DEGRADED",
          subject: "Twilio delivery-status monitoring needs attention",
          body: `${degraded.length} Twilio status lookup(s) returned degraded provider evidence. No automatic resend was attempted.`,
          dedupeSuffix: `degraded:${bucket}`,
          payload: { operationKey: OPERATION_KEY, degradedCount: degraded.length },
        });
      }
      return { skipped: false, polled: results.length, degraded: degraded.length };
    } catch (error) {
      const message = boundedError(error);
      await db.$executeRaw(Prisma.sql`
        UPDATE "PlatformScheduledOperationState"
        SET "leaseOwner"=NULL,"leaseUntil"=NULL,
            "lastFailedAt"=CURRENT_TIMESTAMP,
            "lastError"=${message},
            "consecutiveFailures"="consecutiveFailures"+1,
            "lastResult"='{}'::jsonb,
            "updatedAt"=CURRENT_TIMESTAMP
        WHERE "operationKey"=${OPERATION_KEY} AND "leaseOwner"=${owner}
      `);
      const bucket = new Date().toISOString().slice(0, 10);
      await enqueueOperatorAlerts({
        type: "INTEGRATION_TWILIO_SCHEDULER_FAILED",
        subject: "Twilio monitoring scheduler failed",
        body: "The scheduled Twilio delivery-status monitor failed. No outbound SMS retry was performed.",
        dedupeSuffix: `failed:${bucket}`,
        payload: { operationKey: OPERATION_KEY, error: message },
      });
      throw error;
    }
  }
}
