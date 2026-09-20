import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { salesforceCdcNormalizedEventEvidence } from "@/lib/platform/salesforce-cdc-normalized-event-persistence";

const migration = readFileSync(
  join(process.cwd(), "prisma/migrations/20260920043000_salesforce_cdc_normalized_events/migration.sql"),
  "utf8",
);
const service = readFileSync(
  join(process.cwd(), "src/lib/platform/salesforce-cdc-normalized-event-persistence.ts"),
  "utf8",
);
const runtime = readFileSync(
  join(process.cwd(), "src/lib/platform/integration-runtime.ts"),
  "utf8",
);

function normalizedEvent() {
  return {
    receiptId: "11111111-2222-4333-8444-555555555555",
    schemaId: "schema-001",
    schemaSha256: "a".repeat(64),
    payloadSha256: "b".repeat(64),
    header: {
      entityName: "Account",
      recordIds: ["001000000000001AAA"],
      changeType: "UPDATE" as const,
      changeOrigin: "com/salesforce/api/rest/66.0;client=synthetic",
      transactionKey: "transaction-001",
      sequenceNumber: 1,
      commitTimestamp: 1789875000000,
      commitUser: "005000000000001AAA",
      commitNumber: 42,
      changedFields: ["Name"],
      nulledFields: [],
      diffFields: [],
    },
  };
}

describe("Salesforce CDC normalized-event persistence foundation", () => {
  it("creates one immutable normalized record per immutable receipt", () => {
    expect(migration).toContain('CREATE TABLE "PlatformSalesforceCdcNormalizedEvent"');
    expect(migration).toContain('REFERENCES "PlatformSalesforceCdcEventReceipt"("id") ON DELETE RESTRICT');
    expect(migration).toContain('UNIQUE ("receiptId")');
    expect(migration).toContain('"PlatformSalesforceCdcNormalizedEvent_immutable_update"');
    expect(migration).toContain('"PlatformSalesforceCdcNormalizedEvent_immutable_delete"');
  });

  it("stores only validated normalized header metadata and evidence hashes", () => {
    for (const column of [
      '"schemaId"',
      '"schemaSha256"',
      '"payloadSha256"',
      '"entityName"',
      '"recordIds"',
      '"changeType"',
      '"changeOrigin"',
      '"transactionKey"',
      '"sequenceNumber"',
      '"commitTimestamp"',
      '"commitUser"',
      '"commitNumber"',
      '"changedFields"',
      '"nulledFields"',
      '"diffFields"',
      '"normalizedSha256"',
    ]) {
      expect(migration).toContain(column);
    }
    expect(migration).not.toContain('"recordBody"');
    expect(migration).not.toContain('"payloadBytes" BYTEA');
  });

  it("enforces the reviewed change-type allowlist and JSON array shapes at the database boundary", () => {
    expect(migration).toContain("'CREATE','UPDATE','DELETE','UNDELETE','SNAPSHOT'");
    expect(migration).toContain("'GAP_CREATE','GAP_UPDATE','GAP_DELETE','GAP_UNDELETE','GAP_OVERFLOW'");
    expect(migration).toContain('jsonb_typeof("recordIds") = \'array\'');
    expect(migration).toContain('jsonb_typeof("changedFields") = \'array\'');
    expect(migration).toContain('jsonb_typeof("nulledFields") = \'array\'');
    expect(migration).toContain('jsonb_typeof("diffFields") = \'array\'');
  });

  it("uses deterministic normalization evidence for idempotency verification", () => {
    const event = normalizedEvent();
    const first = salesforceCdcNormalizedEventEvidence.normalizedSha256(event);
    const second = salesforceCdcNormalizedEventEvidence.normalizedSha256(event);

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(service).toContain('ON CONFLICT ("receiptId") DO NOTHING');
    expect(service).toContain("does not match immutable stored normalization");
    expect(service).not.toContain('UPDATE "PlatformSalesforceCdcNormalizedEvent"');
    expect(service).not.toContain('DELETE FROM "PlatformSalesforceCdcNormalizedEvent"');
  });

  it("binds normalization to immutable receipt schema and payload evidence", () => {
    expect(service).toContain('FROM "PlatformSalesforceCdcEventReceipt"');
    expect(service).toContain('receipt.schemaId !== event.schemaId');
    expect(service).toContain('receipt.payloadSha256 !== event.payloadSha256');
    expect(service).toContain("does not match immutable receipt evidence");
  });

  it("does not compose normalized persistence into runtime or mutate QMS state", () => {
    expect(runtime).not.toContain("SalesforceCdcNormalizedEventPersistenceService");
    expect(runtime).not.toContain("salesforce-cdc-normalized-event-persistence");
    expect(service).not.toContain("Document");
    expect(service).not.toContain("Workflow");
    expect(service).not.toContain("ElectronicSignature");
    expect(service).not.toContain("AuditEvent");
  });
});
