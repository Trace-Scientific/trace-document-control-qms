import { Prisma } from "@prisma/client";
import { db } from "../db";
import { requirePlatformAuthorization, type PlatformAuthorizationContext } from "./authorization";
import {
  PlatformIntegrationConfigurationError,
  PlatformIntegrationConflictError,
  PlatformIntegrationNotFoundError,
} from "./integration-framework";

const ADAPTER_KEY = "salesforce.crm";
const TOPIC_PATTERN = /^\/data\/[A-Za-z0-9_]{1,220}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type SalesforceCdcCheckpointKind = "EVENT" | "KEEPALIVE";

function boundedText(value: string, label: string, max: number) {
  const normalized = value.trim();
  if (!normalized) throw new PlatformIntegrationConfigurationError(`${label} is required`);
  if (normalized.length > max) throw new PlatformIntegrationConfigurationError(`${label} is too long`);
  return normalized;
}

export function validateSalesforceCdcTopic(value: string) {
  const topic = boundedText(value, "Salesforce CDC topic", 240);
  if (!TOPIC_PATTERN.test(topic)) {
    throw new PlatformIntegrationConfigurationError("Salesforce CDC topic must be a governed /data/ topic");
  }
  return topic;
}

export function validateSalesforceReplayIdBase64(value: string) {
  const replayId = boundedText(value, "Salesforce replay ID", 4096);
  if (replayId.length % 4 !== 0 || !BASE64_PATTERN.test(replayId)) {
    throw new PlatformIntegrationConfigurationError("Salesforce replay ID must be canonical base64");
  }
  const bytes = Buffer.from(replayId, "base64");
  if (bytes.length === 0 || bytes.length > 3072 || bytes.toString("base64") !== replayId) {
    throw new PlatformIntegrationConfigurationError("Salesforce replay ID is invalid");
  }
  return replayId;
}

export class SalesforceCdcSubscriberStateService {
  async configureDisabled(
    context: PlatformAuthorizationContext,
    input: { connectionId: string; topic: string; reason: string },
  ) {
    requirePlatformAuthorization(context, { permission: "platform.integration.manage" });
    const topic = validateSalesforceCdcTopic(input.topic);
    const reason = boundedText(input.reason, "Reason", 1000);

    return db.$transaction(async (tx) => {
      const connection = await tx.$queryRaw<Array<{ id: string; adapterKey: string; status: string }>>(Prisma.sql`
        SELECT "id","adapterKey","status"::text AS "status"
        FROM "PlatformIntegrationConnection"
        WHERE "id"=${input.connectionId}::uuid
        FOR UPDATE
      `);
      if (connection.length !== 1) throw new PlatformIntegrationNotFoundError("Salesforce integration connection not found");
      if (connection[0].adapterKey !== ADAPTER_KEY) {
        throw new PlatformIntegrationConfigurationError("CDC subscription requires a Salesforce CRM connection");
      }

      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
        INSERT INTO "PlatformSalesforceCdcSubscription" ("connectionId","topic","status")
        VALUES (${input.connectionId}::uuid,${topic},'DISABLED')
        ON CONFLICT ("connectionId","topic") DO UPDATE
        SET "status"='DISABLED',"claimedAt"=NULL,"claimedBy"=NULL,"updatedAt"=CURRENT_TIMESTAMP
        RETURNING "id","status"
      `);

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PlatformAuditEvent"
          ("id","actorIdentityId","actorMembershipId","action","entityType","entityId","reason","metadata")
        VALUES (
          gen_random_uuid(),
          ${context.platformIdentityId}::uuid,
          ${context.platformMembershipId}::uuid,
          'platform.integration.salesforce_cdc.subscription_configured_disabled',
          'PlatformSalesforceCdcSubscription',
          ${rows[0].id}::uuid,
          ${reason},
          ${JSON.stringify({ connectionId: input.connectionId, topic, connectionStatus: connection[0].status })}::jsonb
        )
      `);
      return { id: rows[0].id, status: rows[0].status, topic };
    });
  }

  async claimReady(workerId: string, limit = 1) {
    const worker = boundedText(workerId, "Worker id", 160);
    const boundedLimit = Math.max(1, Math.min(10, Math.trunc(limit)));
    return db.$transaction(async (tx) => tx.$queryRaw<Array<{
      id: string;
      connectionId: string;
      topic: string;
      replayIdBase64: string | null;
      credentialRef: string;
    }>>(Prisma.sql`
      WITH candidates AS (
        SELECT s."id"
        FROM "PlatformSalesforceCdcSubscription" s
        JOIN "PlatformIntegrationConnection" c ON c."id"=s."connectionId"
        WHERE s."status"='READY'
          AND c."status"='ACTIVE'
          AND c."adapterKey"=${ADAPTER_KEY}
          AND (s."claimedAt" IS NULL OR s."claimedAt" < CURRENT_TIMESTAMP - INTERVAL '5 minutes')
        ORDER BY s."updatedAt",s."createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT ${boundedLimit}
      )
      UPDATE "PlatformSalesforceCdcSubscription" s
      SET "status"='RUNNING',"claimedAt"=CURRENT_TIMESTAMP,"claimedBy"=${worker},"updatedAt"=CURRENT_TIMESTAMP
      FROM candidates x, "PlatformIntegrationConnection" c
      WHERE s."id"=x."id" AND c."id"=s."connectionId"
      RETURNING s."id",s."connectionId",s."topic",s."replayIdBase64",c."credentialRef"
    `));
  }

  async checkpoint(input: {
    subscriptionId: string;
    workerId: string;
    replayIdBase64: string;
    kind: SalesforceCdcCheckpointKind;
  }) {
    const worker = boundedText(input.workerId, "Worker id", 160);
    const replayIdBase64 = validateSalesforceReplayIdBase64(input.replayIdBase64);
    const eventTimestamp = input.kind === "EVENT" ? new Date() : null;
    const keepaliveTimestamp = input.kind === "KEEPALIVE" ? new Date() : null;

    const updated = await db.$executeRaw(Prisma.sql`
      UPDATE "PlatformSalesforceCdcSubscription"
      SET "replayIdBase64"=${replayIdBase64},
          "lastCheckpointAt"=CURRENT_TIMESTAMP,
          "lastEventAt"=COALESCE(${eventTimestamp},"lastEventAt"),
          "lastKeepaliveAt"=COALESCE(${keepaliveTimestamp},"lastKeepaliveAt"),
          "lastFailureCode"=NULL,
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${input.subscriptionId}::uuid
        AND "status"='RUNNING'
        AND "claimedBy"=${worker}
    `);
    if (updated !== 1) throw new PlatformIntegrationConflictError("Salesforce CDC subscription is not claimed by this worker");
  }

  async release(subscriptionId: string, workerId: string) {
    const worker = boundedText(workerId, "Worker id", 160);
    const updated = await db.$executeRaw(Prisma.sql`
      UPDATE "PlatformSalesforceCdcSubscription"
      SET "status"='READY',"claimedAt"=NULL,"claimedBy"=NULL,"updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${subscriptionId}::uuid AND "status"='RUNNING' AND "claimedBy"=${worker}
    `);
    if (updated !== 1) throw new PlatformIntegrationConflictError("Salesforce CDC subscription is not claimed by this worker");
  }

  async markDegraded(subscriptionId: string, workerId: string, failureCode: string) {
    const worker = boundedText(workerId, "Worker id", 160);
    const code = boundedText(failureCode, "Failure code", 160);
    const updated = await db.$executeRaw(Prisma.sql`
      UPDATE "PlatformSalesforceCdcSubscription"
      SET "status"='DEGRADED',"lastFailureCode"=${code},"claimedAt"=NULL,"claimedBy"=NULL,"updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${subscriptionId}::uuid AND "status"='RUNNING' AND "claimedBy"=${worker}
    `);
    if (updated !== 1) throw new PlatformIntegrationConflictError("Salesforce CDC subscription is not claimed by this worker");
  }
}
