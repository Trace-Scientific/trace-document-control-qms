import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import {
  PlatformIntegrationConfigurationError,
  PlatformIntegrationNotFoundError,
  type NormalizedInboundEvent,
  type PlatformIntegrationWebhookEvidence,
} from "./integration-framework";
import { platformCredentialResolver, platformIntegrationRegistry } from "./integration-runtime";

function requireIdempotency(value: string) {
  const normalized = value.trim();
  if (!normalized) throw new PlatformIntegrationConfigurationError("Idempotency key is required");
  if (normalized.length > 240) throw new PlatformIntegrationConfigurationError("Idempotency key is too long");
  return normalized;
}

function callbackText(value: unknown, label: string, max: number) {
  if (typeof value !== "string" || !value.trim()) throw new PlatformIntegrationConfigurationError(`${label} is required`);
  const normalized = value.trim();
  if (normalized.length > max) throw new PlatformIntegrationConfigurationError(`${label} is too long`);
  return normalized;
}

async function applyVerifiedTwilioStatusCallback(
  tx: Prisma.TransactionClient,
  input: { connectionId: string; receiptId: string; normalized: NormalizedInboundEvent },
) {
  if (input.normalized.eventType !== "twilio.sms.status") return;
  const payload = input.normalized.payload as Record<string, unknown>;
  const deliveryKey = callbackText(payload.deliveryKey, "Twilio delivery key", 240);
  const messageSid = callbackText(payload.messageSid, "Twilio message SID", 64);
  const messageStatus = callbackText(payload.messageStatus, "Twilio message status", 32).toLowerCase();
  if (!/^SM[a-fA-F0-9]{32}$/.test(messageSid)) throw new PlatformIntegrationConfigurationError("Twilio message SID is invalid");

  const rows = await tx.$queryRaw<Array<{
    id: string;
    status: string;
    providerObjectId: string | null;
  }>>(Prisma.sql`
    SELECT "id","status"::text AS "status","providerObjectId"
    FROM "PlatformIntegrationDelivery"
    WHERE "connectionId"=${input.connectionId}::uuid AND "idempotencyKey"=${deliveryKey}
    FOR UPDATE
  `);
  if (rows.length !== 1) throw new PlatformIntegrationConfigurationError("Twilio callback does not match a governed outbound delivery");
  const delivery = rows[0];
  if (delivery.providerObjectId && delivery.providerObjectId !== messageSid) {
    throw new PlatformIntegrationConfigurationError("Twilio callback message SID does not match the outbound delivery");
  }

  const providerOutcome = `TWILIO_${messageStatus.toUpperCase()}`.slice(0, 160);
  const resolveAmbiguity = delivery.status === "RECONCILIATION_REQUIRED";

  if (resolveAmbiguity) {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "PlatformIntegrationDelivery"
      SET "status"='SUCCEEDED',"providerObjectId"=${messageSid},"providerOutcome"=${providerOutcome},
          "reconciliationReason"='TWILIO_SIGNED_CALLBACK_CONFIRMED_PROVIDER_ACCEPTANCE',
          "deliveredAt"=COALESCE("deliveredAt",CURRENT_TIMESTAMP),"lastError"=NULL,
          "claimedAt"=NULL,"claimedBy"=NULL,"deadLetteredAt"=NULL
      WHERE "id"=${delivery.id}::uuid AND "status"='RECONCILIATION_REQUIRED'
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "PlatformAuditEvent" ("id","action","entityType","entityId","reason","metadata")
      VALUES (
        gen_random_uuid(),
        'platform.integration.delivery.reconciled_by_provider_callback',
        'PlatformIntegrationDelivery',
        ${delivery.id}::uuid,
        'Verified Twilio status callback confirmed provider acceptance.',
        ${JSON.stringify({
          provider: "twilio",
          receiptId: input.receiptId,
          messageSid,
          messageStatus,
          previousStatus: delivery.status,
          resolution: "CONFIRMED_SUCCEEDED",
        })}::jsonb
      )
    `);
    return;
  }

  await tx.$executeRaw(Prisma.sql`
    UPDATE "PlatformIntegrationDelivery"
    SET "providerObjectId"=COALESCE("providerObjectId",${messageSid}),"providerOutcome"=${providerOutcome}
    WHERE "id"=${delivery.id}::uuid
  `);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "PlatformAuditEvent" ("id","action","entityType","entityId","reason","metadata")
    VALUES (
      gen_random_uuid(),
      'platform.integration.delivery.provider_status_observed',
      'PlatformIntegrationDelivery',
      ${delivery.id}::uuid,
      'Verified Twilio status callback updated provider delivery evidence.',
      ${JSON.stringify({
        provider: "twilio",
        receiptId: input.receiptId,
        messageSid,
        messageStatus,
        deliveryStatus: delivery.status,
      })}::jsonb
    )
  `);
}

async function applyVerifiedSendGridStatusCallback(
  tx: Prisma.TransactionClient,
  input: { connectionId: string; receiptId: string; normalized: NormalizedInboundEvent },
) {
  if (input.normalized.eventType !== "sendgrid.email.delivery_status") return;
  const payload = input.normalized.payload as Record<string, unknown>;
  if (!Array.isArray(payload.events) || payload.events.length === 0) {
    throw new PlatformIntegrationConfigurationError("SendGrid delivery event batch is empty");
  }

  for (const rawEvent of payload.events) {
    if (!rawEvent || typeof rawEvent !== "object" || Array.isArray(rawEvent)) {
      throw new PlatformIntegrationConfigurationError("SendGrid delivery event is invalid");
    }
    const event = rawEvent as Record<string, unknown>;
    const deliveryKey = callbackText(event.deliveryKey, "SendGrid delivery key", 240);
    const messageId = callbackText(event.messageId, "SendGrid message ID", 500);
    const eventId = callbackText(event.eventId, "SendGrid event ID", 200);
    const eventType = callbackText(event.eventType, "SendGrid event type", 40).toLowerCase();

    const rows = await tx.$queryRaw<Array<{
      id: string;
      status: string;
      providerObjectId: string | null;
    }>>(Prisma.sql`
      SELECT "id","status"::text AS "status","providerObjectId"
      FROM "PlatformIntegrationDelivery"
      WHERE "connectionId"=${input.connectionId}::uuid AND "idempotencyKey"=${deliveryKey}
      FOR UPDATE
    `);
    if (rows.length !== 1) throw new PlatformIntegrationConfigurationError("SendGrid callback does not match a governed outbound delivery");
    const delivery = rows[0];
    if (delivery.providerObjectId && delivery.providerObjectId !== messageId) {
      throw new PlatformIntegrationConfigurationError("SendGrid callback message ID does not match the outbound delivery");
    }

    const providerOutcome = `SENDGRID_${eventType.toUpperCase()}`.slice(0, 160);
    const resolveAmbiguity = delivery.status === "RECONCILIATION_REQUIRED";

    if (resolveAmbiguity) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "PlatformIntegrationDelivery"
        SET "status"='SUCCEEDED',"providerObjectId"=${messageId},"providerOutcome"=${providerOutcome},
            "reconciliationReason"='SENDGRID_SIGNED_EVENT_CONFIRMED_PROVIDER_ACCEPTANCE',
            "deliveredAt"=COALESCE("deliveredAt",CURRENT_TIMESTAMP),"lastError"=NULL,
            "claimedAt"=NULL,"claimedBy"=NULL,"deadLetteredAt"=NULL
        WHERE "id"=${delivery.id}::uuid AND "status"='RECONCILIATION_REQUIRED'
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PlatformAuditEvent" ("id","action","entityType","entityId","reason","metadata")
        VALUES (
          gen_random_uuid(),
          'platform.integration.delivery.reconciled_by_provider_callback',
          'PlatformIntegrationDelivery',
          ${delivery.id}::uuid,
          'Verified SendGrid Event Webhook confirmed provider acceptance.',
          ${JSON.stringify({
            provider: "sendgrid",
            receiptId: input.receiptId,
            eventId,
            messageId,
            eventType,
            previousStatus: delivery.status,
            resolution: "CONFIRMED_SUCCEEDED",
          })}::jsonb
        )
      `);
      continue;
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE "PlatformIntegrationDelivery"
      SET "providerObjectId"=COALESCE("providerObjectId",${messageId}),"providerOutcome"=${providerOutcome}
      WHERE "id"=${delivery.id}::uuid
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "PlatformAuditEvent" ("id","action","entityType","entityId","reason","metadata")
      VALUES (
        gen_random_uuid(),
        'platform.integration.delivery.provider_status_observed',
        'PlatformIntegrationDelivery',
        ${delivery.id}::uuid,
        'Verified SendGrid Event Webhook updated provider delivery evidence.',
        ${JSON.stringify({
          provider: "sendgrid",
          receiptId: input.receiptId,
          eventId,
          messageId,
          eventType,
          deliveryStatus: delivery.status,
        })}::jsonb
      )
    `);
  }
}

export async function receivePlatformIntegrationWebhook(input: PlatformIntegrationWebhookEvidence & {
  connectionId: string;
  idempotencyKey: string;
  correlationId?: string | null;
}) {
  const idempotencyKey = requireIdempotency(input.idempotencyKey);
  const connections = await db.$queryRaw<Array<{ id: string; adapterKey: string; configuration: unknown; credentialRef: string | null }>>(Prisma.sql`
    SELECT "id","adapterKey","configuration","credentialRef"
    FROM "PlatformIntegrationConnection"
    WHERE "id"=${input.connectionId}::uuid AND "status"='ACTIVE'
  `);
  if (connections.length !== 1) throw new PlatformIntegrationNotFoundError("Active integration connection not found");
  const connection = connections[0];
  const bodyHash = createHash("sha256").update(input.rawBodyBytes).digest("hex");

  const receipts = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO "PlatformInboundWebhookReceipt" ("connectionId","idempotencyKey","rawBodySha256","correlationId")
    VALUES (${connection.id}::uuid,${idempotencyKey},${bodyHash},${input.correlationId ?? null}::uuid)
    ON CONFLICT ("connectionId","idempotencyKey") DO NOTHING
    RETURNING "id"
  `);
  if (receipts.length === 0) return { duplicate: true };
  const receiptId = receipts[0].id;

  try {
    const adapter = platformIntegrationRegistry.get(connection.adapterKey);
    if (!adapter) throw new PlatformIntegrationConfigurationError("Adapter is not registered in this release");
    const credential = await platformCredentialResolver.resolve(connection.credentialRef);
    const normalized = await adapter.verifyAndNormalizeWebhook({
      rawBody: input.rawBody,
      rawBodyBytes: input.rawBodyBytes,
      requestUrl: input.requestUrl,
      formParameters: input.formParameters,
      headers: input.headers,
      configuration: connection.configuration,
      credential,
    });
    await db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "PlatformInboundWebhookReceipt"
        SET "providerEventId"=${normalized.providerEventId ?? null},"status"='NORMALIZED',"verifiedAt"=CURRENT_TIMESTAMP,"normalizedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${receiptId}::uuid AND "status"='RECEIVED'
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PlatformIntegrationNormalizedEvent" ("receiptId","connectionId","eventType","payload","correlationId")
        VALUES (${receiptId}::uuid,${connection.id}::uuid,${normalized.eventType},${JSON.stringify(normalized.payload)}::jsonb,${input.correlationId ?? null}::uuid)
      `);
      await applyVerifiedTwilioStatusCallback(tx, { connectionId: connection.id, receiptId, normalized });\n      await applyVerifiedSendGridStatusCallback(tx, { connectionId: connection.id, receiptId, normalized });
    });
    return { duplicate: false, receiptId };
  } catch {
    await db.$executeRaw(Prisma.sql`
      UPDATE "PlatformInboundWebhookReceipt"
      SET "status"='REJECTED',"rejectionReason"='Webhook verification, normalization, or provider correlation failed'
      WHERE "id"=${receiptId}::uuid AND "status"='RECEIVED'
    `);
    throw new PlatformIntegrationConfigurationError("Inbound webhook rejected");
  }
}
