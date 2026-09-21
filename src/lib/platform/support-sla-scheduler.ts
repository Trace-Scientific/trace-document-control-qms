import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { SupportSlaEscalationService } from "@/lib/platform/support-sla-escalation";

const OPERATION_KEY = "support.sla.overdue.scan";
const LEASE_MINUTES = 10;

function boundedError(value: unknown) {
  const message = value instanceof Error ? value.message : "Support SLA scheduled scan failed";
  return message.slice(0, 1000);
}

export class SupportSlaSchedulerService {
  constructor(private readonly escalation = new SupportSlaEscalationService()) {}

  async runScheduled() {
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
      const result = await this.escalation.scanSystem();
      await db.$executeRaw(Prisma.sql`
        UPDATE "PlatformScheduledOperationState"
        SET "leaseOwner"=NULL,"leaseUntil"=NULL,
            "lastSucceededAt"=CURRENT_TIMESTAMP,
            "lastError"=NULL,
            "consecutiveFailures"=0,
            "lastResult"=${JSON.stringify(result)}::jsonb,
            "updatedAt"=CURRENT_TIMESTAMP
        WHERE "operationKey"=${OPERATION_KEY} AND "leaseOwner"=${owner}
      `);
      return { skipped: false, ...result };
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
      throw error;
    }
  }
}
