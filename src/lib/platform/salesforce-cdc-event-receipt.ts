import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import {
  PlatformIntegrationConfigurationError,
  PlatformIntegrationConflictError,
} from "./integration-framework";
import {
  validateSalesforceCdcTopic,
  validateSalesforceReplayIdBase64,
} from "./salesforce-cdc-subscriber-state";
import type { SalesforcePubSubConsumerEventEnvelope } from "./salesforce-pubsub-subscribe-protocol";

const MAX_EVENT_PAYLOAD_BYTES = 3 * 1024 * 1024;

function boundedText(value: string, label: string, max: number) {
  const normalized = value.trim();
  if (!normalized) throw new PlatformIntegrationConfigurationError(`${label} is required`);
  if (normalized.length > max) throw new PlatformIntegrationConfigurationError(`${label} is too long`);
  return normalized;
}

export type SalesforceCdcEventReceiptInput = {
  subscriptionId: string;
  connectionId: string;
  topic: string;
  event: SalesforcePubSubConsumerEventEnvelope;
};

export type SalesforceCdcEventReceiptResult = {
  id: string;
  duplicate: boolean;
  payloadSha256: string;
};

export class SalesforceCdcEventReceiptService {
  async persist(input: SalesforceCdcEventReceiptInput): Promise<SalesforceCdcEventReceiptResult> {
    const topic = validateSalesforceCdcTopic(input.topic);
    const eventId = boundedText(input.event.eventId, "Salesforce event ID", 512);
    const schemaId = boundedText(input.event.schemaId, "Salesforce schema ID", 512);
    const replayIdBase64 = validateSalesforceReplayIdBase64(input.event.replayIdBase64);
    const payloadBytes = Buffer.from(input.event.payloadBytes);

    if (payloadBytes.length < 1 || payloadBytes.length > MAX_EVENT_PAYLOAD_BYTES) {
      throw new PlatformIntegrationConfigurationError("Salesforce event payload size is invalid");
    }

    const payloadSha256 = createHash("sha256").update(payloadBytes).digest("hex");

    return db.$transaction(async (tx) => {
      const subscription = await tx.$queryRaw<Array<{
        id: string;
        connectionId: string;
        topic: string;
        status: string;
      }>>(Prisma.sql`
        SELECT "id","connectionId","topic","status"::text AS "status"
        FROM "PlatformSalesforceCdcSubscription"
        WHERE "id"=${input.subscriptionId}::uuid
        FOR SHARE
      `);

      if (subscription.length !== 1) {
        throw new PlatformIntegrationConfigurationError("Salesforce CDC subscription does not exist");
      }
      if (subscription[0].connectionId !== input.connectionId || subscription[0].topic !== topic) {
        throw new PlatformIntegrationConflictError("Salesforce event receipt does not match its governed subscription");
      }
      if (subscription[0].status !== "RUNNING") {
        throw new PlatformIntegrationConflictError("Salesforce event receipt requires a RUNNING subscription");
      }

      const inserted = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "PlatformSalesforceCdcEventReceipt"
          ("subscriptionId","connectionId","topic","eventId","schemaId","replayIdBase64","payloadBytes","payloadSha256")
        VALUES (
          ${input.subscriptionId}::uuid,
          ${input.connectionId}::uuid,
          ${topic},
          ${eventId},
          ${schemaId},
          ${replayIdBase64},
          ${payloadBytes},
          ${payloadSha256}
        )
        ON CONFLICT ("subscriptionId","eventId","replayIdBase64") DO NOTHING
        RETURNING "id"
      `);

      if (inserted.length === 1) {
        return { id: inserted[0].id, duplicate: false, payloadSha256 };
      }

      const existing = await tx.$queryRaw<Array<{
        id: string;
        connectionId: string;
        topic: string;
        schemaId: string;
        payloadSha256: string;
      }>>(Prisma.sql`
        SELECT "id","connectionId","topic","schemaId","payloadSha256"
        FROM "PlatformSalesforceCdcEventReceipt"
        WHERE "subscriptionId"=${input.subscriptionId}::uuid
          AND "eventId"=${eventId}
          AND "replayIdBase64"=${replayIdBase64}
      `);

      if (existing.length !== 1) {
        throw new PlatformIntegrationConflictError("Salesforce event receipt idempotency state is inconsistent");
      }

      const row = existing[0];
      if (
        row.connectionId !== input.connectionId ||
        row.topic !== topic ||
        row.schemaId !== schemaId ||
        row.payloadSha256 !== payloadSha256
      ) {
        throw new PlatformIntegrationConflictError("Salesforce replayed event does not match the immutable stored receipt");
      }

      return { id: row.id, duplicate: true, payloadSha256 };
    });
  }
}
