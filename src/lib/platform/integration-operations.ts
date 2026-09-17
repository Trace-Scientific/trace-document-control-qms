import { Prisma } from "@prisma/client";
import { db } from "../db";
import { requirePlatformAuthorization, type PlatformAuthorizationContext } from "./authorization";
import { PlatformIntegrationConflictError, PlatformIntegrationNotFoundError } from "./integration-framework";

function reason(value: string) {
  const normalized = value.trim();
  if (!normalized) throw new PlatformIntegrationConflictError("Replay reason is required");
  return normalized.slice(0, 1000);
}

export class PlatformIntegrationOperationsService {
  async listDeliveries(context: PlatformAuthorizationContext) {
    requirePlatformAuthorization(context, { permission: "platform.integration.manage" });
    return db.$queryRaw<Array<{
      id: string;
      connectionId: string;
      eventType: string;
      status: string;
      attemptCount: number;
      availableAt: Date;
      lastError: string | null;
      providerRequestId: string | null;
      providerObjectId: string | null;
      providerOutcome: string | null;
      reconciliationReason: string | null;
      reconciledAt: Date | null;
      createdAt: Date;
    }>>(Prisma.sql`
      SELECT "id","connectionId","eventType","status"::text AS "status","attemptCount","availableAt","lastError",
             "providerRequestId","providerObjectId","providerOutcome","reconciliationReason","reconciledAt","createdAt"
      FROM "PlatformIntegrationDelivery" ORDER BY "createdAt" DESC LIMIT 250
    `);
  }

  async listInboundReceipts(context: PlatformAuthorizationContext) {
    requirePlatformAuthorization(context, { permission: "platform.integration.manage" });
    return db.$queryRaw<Array<{ id: string; connectionId: string; status: string; providerEventId: string | null; rawBodySha256: string; receivedAt: Date }>>(Prisma.sql`
      SELECT "id","connectionId","status"::text AS "status","providerEventId","rawBodySha256","receivedAt"
      FROM "PlatformInboundWebhookReceipt" ORDER BY "receivedAt" DESC LIMIT 250
    `);
  }

  async requeueDeadLetter(context: PlatformAuthorizationContext, deliveryId: string, reasonInput: string) {
    requirePlatformAuthorization(context, { permission: "platform.integration.manage" });
    const replayReason = reason(reasonInput);
    return db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "PlatformIntegrationDelivery" d
        SET "status"='PENDING',"attemptCount"=0,"availableAt"=CURRENT_TIMESTAMP,"claimedAt"=NULL,"claimedBy"=NULL,
            "lastAttemptAt"=NULL,"deliveredAt"=NULL,"deadLetteredAt"=NULL,"lastError"=NULL,
            "providerOutcome"='MANUALLY_REQUEUED'
        FROM "PlatformIntegrationConnection" c
        WHERE d."id"=${deliveryId}::uuid AND d."status"='DEAD_LETTER' AND c."id"=d."connectionId" AND c."status"='ACTIVE'
        RETURNING d."id"
      `);
      if (rows.length !== 1) throw new PlatformIntegrationNotFoundError("Active dead-letter delivery not found");
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PlatformAuditEvent" ("id","actorIdentityId","actorMembershipId","action","entityType","entityId","reason","metadata")
        VALUES (gen_random_uuid(),${context.platformIdentityId}::uuid,${context.platformMembershipId}::uuid,'platform.integration.delivery.requeued','PlatformIntegrationDelivery',${deliveryId}::uuid,${replayReason},'{}'::jsonb)
      `);
      return rows[0];
    });
  }
}
