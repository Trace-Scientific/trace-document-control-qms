import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import {
  PlatformIntegrationConfigurationError,
  PlatformIntegrationConflictError,
} from "./integration-framework";
import type { SalesforceNormalizedCdcEvent } from "./salesforce-cdc-semantic-normalizer";

function canonicalNormalizedPayload(event: SalesforceNormalizedCdcEvent) {
  return JSON.stringify({
    receiptId: event.receiptId,
    schemaId: event.schemaId,
    schemaSha256: event.schemaSha256,
    payloadSha256: event.payloadSha256,
    header: {
      entityName: event.header.entityName,
      recordIds: event.header.recordIds,
      changeType: event.header.changeType,
      changeOrigin: event.header.changeOrigin,
      transactionKey: event.header.transactionKey,
      sequenceNumber: event.header.sequenceNumber,
      commitTimestamp: event.header.commitTimestamp,
      commitUser: event.header.commitUser,
      commitNumber: event.header.commitNumber,
      changedFields: event.header.changedFields,
      nulledFields: event.header.nulledFields,
      diffFields: event.header.diffFields,
    },
  });
}

function normalizedSha256(event: SalesforceNormalizedCdcEvent) {
  return createHash("sha256")
    .update(canonicalNormalizedPayload(event), "utf8")
    .digest("hex");
}

export type SalesforceCdcNormalizedEventPersistResult = {
  id: string;
  duplicate: boolean;
  normalizedSha256: string;
};

export class SalesforceCdcNormalizedEventPersistenceService {
  async persist(
    event: SalesforceNormalizedCdcEvent,
  ): Promise<SalesforceCdcNormalizedEventPersistResult> {
    const digest = normalizedSha256(event);

    return db.$transaction(async (tx) => {
      const receipts = await tx.$queryRaw<Array<{
        id: string;
        schemaId: string;
        payloadSha256: string;
      }>>(Prisma.sql`
        SELECT "id","schemaId","payloadSha256"
        FROM "PlatformSalesforceCdcEventReceipt"
        WHERE "id"=${event.receiptId}::uuid
        FOR SHARE
      `);

      if (receipts.length !== 1) {
        throw new PlatformIntegrationConfigurationError(
          "Salesforce normalized event receipt does not exist",
        );
      }

      const receipt = receipts[0];
      if (
        receipt.schemaId !== event.schemaId ||
        receipt.payloadSha256 !== event.payloadSha256
      ) {
        throw new PlatformIntegrationConflictError(
          "Salesforce normalized event does not match immutable receipt evidence",
        );
      }

      const inserted = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "PlatformSalesforceCdcNormalizedEvent" (
          "receiptId","schemaId","schemaSha256","payloadSha256",
          "entityName","recordIds","changeType","changeOrigin",
          "transactionKey","sequenceNumber","commitTimestamp",
          "commitUser","commitNumber","changedFields","nulledFields",
          "diffFields","normalizedSha256"
        )
        VALUES (
          ${event.receiptId}::uuid,
          ${event.schemaId},
          ${event.schemaSha256},
          ${event.payloadSha256},
          ${event.header.entityName},
          ${JSON.stringify(event.header.recordIds)}::jsonb,
          ${event.header.changeType},
          ${event.header.changeOrigin},
          ${event.header.transactionKey},
          ${event.header.sequenceNumber}::bigint,
          ${event.header.commitTimestamp}::bigint,
          ${event.header.commitUser},
          ${event.header.commitNumber}::bigint,
          ${JSON.stringify(event.header.changedFields)}::jsonb,
          ${JSON.stringify(event.header.nulledFields)}::jsonb,
          ${JSON.stringify(event.header.diffFields)}::jsonb,
          ${digest}
        )
        ON CONFLICT ("receiptId") DO NOTHING
        RETURNING "id"
      `);

      if (inserted.length === 1) {
        return {
          id: inserted[0].id,
          duplicate: false,
          normalizedSha256: digest,
        };
      }

      const existing = await tx.$queryRaw<Array<{
        id: string;
        schemaId: string;
        schemaSha256: string;
        payloadSha256: string;
        normalizedSha256: string;
      }>>(Prisma.sql`
        SELECT "id","schemaId","schemaSha256","payloadSha256","normalizedSha256"
        FROM "PlatformSalesforceCdcNormalizedEvent"
        WHERE "receiptId"=${event.receiptId}::uuid
      `);

      if (existing.length !== 1) {
        throw new PlatformIntegrationConflictError(
          "Salesforce normalized event idempotency state is inconsistent",
        );
      }

      const row = existing[0];
      if (
        row.schemaId !== event.schemaId ||
        row.schemaSha256 !== event.schemaSha256 ||
        row.payloadSha256 !== event.payloadSha256 ||
        row.normalizedSha256 !== digest
      ) {
        throw new PlatformIntegrationConflictError(
          "Salesforce normalized event does not match immutable stored normalization",
        );
      }

      return {
        id: row.id,
        duplicate: true,
        normalizedSha256: digest,
      };
    });
  }
}

export const salesforceCdcNormalizedEventEvidence = Object.freeze({
  canonicalNormalizedPayload,
  normalizedSha256,
});
