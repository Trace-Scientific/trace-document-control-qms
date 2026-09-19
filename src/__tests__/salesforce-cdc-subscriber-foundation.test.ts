import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  validateSalesforceCdcTopic,
  validateSalesforceReplayIdBase64,
} from "@/lib/platform/salesforce-cdc-subscriber-state";

const root = process.cwd();
const migration = readFileSync(
  join(root, "prisma/migrations/20260919150000_salesforce_cdc_subscriber_foundation/migration.sql"),
  "utf8",
);
const service = readFileSync(
  join(root, "src/lib/platform/salesforce-cdc-subscriber-state.ts"),
  "utf8",
);

describe("Salesforce CDC subscriber foundation", () => {
  it("creates durable connection/topic-scoped replay state disabled by default", () => {
    expect(migration).toContain('CREATE TABLE "PlatformSalesforceCdcSubscription"');
    expect(migration).toContain('"status" TEXT NOT NULL DEFAULT \'DISABLED\'');
    expect(migration).toContain('UNIQUE ("connectionId","topic")');
    expect(migration).toContain('"replayIdBase64" TEXT');
    expect(migration).toContain('"lastKeepaliveAt" TIMESTAMPTZ(3)');
    expect(migration).toContain('"claimedBy" TEXT');
  });

  it("accepts only governed Salesforce data topics", () => {
    expect(validateSalesforceCdcTopic("/data/ChangeEvents")).toBe("/data/ChangeEvents");
    expect(validateSalesforceCdcTopic("/data/AccountChangeEvent")).toBe("/data/AccountChangeEvent");
    expect(validateSalesforceCdcTopic("/data/Trace_Channel__chn")).toBe("/data/Trace_Channel__chn");
    expect(() => validateSalesforceCdcTopic("/event/Anything__e")).toThrow("governed /data/ topic");
    expect(() => validateSalesforceCdcTopic("https://example.com/data/ChangeEvents")).toThrow("governed /data/ topic");
  });

  it("treats replay IDs as opaque canonical base64 rather than integers", () => {
    expect(validateSalesforceReplayIdBase64("AQIDBA==")).toBe("AQIDBA==");
    expect(() => validateSalesforceReplayIdBase64("12345")).toThrow("canonical base64");
    expect(() => validateSalesforceReplayIdBase64("")).toThrow("is required");
  });

  it("allows worker claims only from READY state on active Salesforce connections", () => {
    expect(service).toContain('WHERE s."status"=\'READY\'');
    expect(service).toContain('c."status"=\'ACTIVE\'');
    expect(service).toContain('c."adapterKey"=${ADAPTER_KEY}');
    expect(service).toContain("FOR UPDATE SKIP LOCKED");
  });

  it("checkpoints both event and keepalive replay positions under worker ownership", () => {
    expect(service).toContain('"lastCheckpointAt"=CURRENT_TIMESTAMP');
    expect(service).toContain('"lastEventAt"=COALESCE');
    expect(service).toContain('"lastKeepaliveAt"=COALESCE');
    expect(service).toContain('AND "status"=\'RUNNING\'');
    expect(service).toContain('AND "claimedBy"=${worker}');
  });

  it("does not activate a subscriber or introduce a gRPC transport in this slice", () => {
    expect(service).not.toContain("grpc");
    expect(service).not.toContain("SubscribeRequest");
    expect(service).not.toContain("PlatformIntegrationNormalizedEvent");
    expect(service).not.toContain('"status"=\'READY\' WHERE');
    expect(service).toContain("'platform.integration.salesforce_cdc.subscription_configured_disabled'");
  });
});
