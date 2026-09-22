import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "prisma/migrations/20260920030000_salesforce_cdc_event_receipts/migration.sql"),
  "utf8",
);
const service = readFileSync(
  join(process.cwd(), "src/lib/platform/salesforce-cdc-event-receipt.ts"),
  "utf8",
);
const controller = readFileSync(
  join(process.cwd(), "src/lib/platform/salesforce-cdc-subscriber-controller.ts"),
  "utf8",
);
const runtime = readFileSync(
  join(process.cwd(), "src/lib/platform/integration-runtime.ts"),
  "utf8",
);

describe("Salesforce CDC durable event receipt foundation", () => {
  it("creates immutable bounded raw-event receipts with governed foreign keys", () => {
    expect(migration).toContain('CREATE TABLE "PlatformSalesforceCdcEventReceipt"');
    expect(migration).toContain('REFERENCES "PlatformSalesforceCdcSubscription"("id") ON DELETE RESTRICT');
    expect(migration).toContain('REFERENCES "PlatformIntegrationConnection"("id") ON DELETE RESTRICT');
    expect(migration).toContain('"payloadBytes" BYTEA NOT NULL');
    expect(migration).toContain('octet_length("payloadBytes") BETWEEN 1 AND 3145728');
    expect(migration).toContain('UNIQUE ("subscriptionId","eventId","replayIdBase64")');
    expect(migration).toContain('"PlatformSalesforceCdcEventReceipt_immutable_update"');
    expect(migration).toContain('"PlatformSalesforceCdcEventReceipt_immutable_delete"');
  });

  it("persists by insert-only idempotency and verifies immutable duplicate evidence", () => {
    expect(service).toContain('ON CONFLICT ("subscriptionId","eventId","replayIdBase64") DO NOTHING');
    expect(service).toContain('createHash("sha256").update(payloadBytes).digest("hex")');
    expect(service).toContain("Salesforce replayed event does not match the immutable stored receipt");
    expect(service).not.toContain('UPDATE "PlatformSalesforceCdcEventReceipt"');
    expect(service).not.toContain('DELETE FROM "PlatformSalesforceCdcEventReceipt"');
  });

  it("requires the receipt to match the RUNNING governed subscription", () => {
    expect(service).toContain('subscription[0].connectionId !== input.connectionId');
    expect(service).toContain('subscription[0].topic !== topic');
    expect(service).toContain('subscription[0].status !== "RUNNING"');
    expect(service).toContain("Salesforce event receipt requires a RUNNING subscription");
  });

  it("orders event receipt persistence before EVENT replay advancement", () => {
    const persistIndex = controller.indexOf("await this.receipts.persist");
    const eventCheckpointIndex = controller.indexOf('kind: "EVENT"');
    expect(persistIndex).toBeGreaterThan(-1);
    expect(eventCheckpointIndex).toBeGreaterThan(persistIndex);
    expect(controller).toContain("EVENT_RECEIPT_PERSIST_FAILED");
  });

  it("keeps durable receipt separation while allowing governed subscriber flow control", () => {
    expect(service).not.toContain("avro");
    expect(service).not.toContain("PlatformIntegrationNormalizedEvent");
    expect(controller).toContain("requestMore(");
    expect(controller).toContain("FLOW_CONTROL_FAILED");
    expect(runtime).not.toContain("SalesforceCdcSubscriberController");
    expect(runtime).not.toContain("salesforce-cdc-event-receipt");
  });
});
