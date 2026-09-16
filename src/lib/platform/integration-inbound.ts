import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { PlatformIntegrationConfigurationError, PlatformIntegrationNotFoundError } from "./integration-framework";
import { platformCredentialResolver, platformIntegrationRegistry } from "./integration-runtime";

function requireIdempotency(value: string) {
  const normalized = value.trim();
  if (!normalized) throw new PlatformIntegrationConfigurationError("Idempotency key is required");
  if (normalized.length > 240) throw new PlatformIntegrationConfigurationError("Idempotency key is too long");
  return normalized;
}

export type ProviderSafeWebhookEvidence = {
  rawBody: string;
  rawBodyBytes: Uint8Array;
  requestUrl: string;
  formParameters?: Readonly<Record<string, readonly string[]>>;
  headers: Headers;
};

export async function receivePlatformIntegrationWebhook(input: ProviderSafeWebhookEvidence & {
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
    const webhookEvidence = {
      rawBody: input.rawBody,
      rawBodyBytes: input.rawBodyBytes,
      requestUrl: input.requestUrl,
      formParameters: input.formParameters,
      headers: input.headers,
      configuration: connection.configuration,
      credential,
    };
    const normalized = await adapter.verifyAndNormalizeWebhook(webhookEvidence);
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
    });
    return { duplicate: false, receiptId };
  } catch {
    await db.$executeRaw(Prisma.sql`
      UPDATE "PlatformInboundWebhookReceipt"
      SET "status"='REJECTED',"rejectionReason"='Webhook verification or normalization failed'
      WHERE "id"=${receiptId}::uuid AND "status"='RECEIVED'
    `);
    throw new PlatformIntegrationConfigurationError("Inbound webhook rejected");
  }
}
