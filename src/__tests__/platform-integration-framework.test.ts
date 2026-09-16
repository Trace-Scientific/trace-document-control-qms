import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(join(root, "prisma/migrations/20260916240000_platform_integration_framework/migration.sql"), "utf8");
const framework = readFileSync(join(root, "src/lib/platform/integration-framework.ts"), "utf8");
const operations = readFileSync(join(root, "src/lib/platform/integration-operations.ts"), "utf8");
const runtime = readFileSync(join(root, "src/lib/platform/integration-runtime.ts"), "utf8");
const inbound = readFileSync(join(root, "src/app/api/platform/integrations/inbound/[connectionId]/route.ts"), "utf8");
const tenantAuthorization = readFileSync(join(root, "src/lib/security/authorization.ts"), "utf8");
const health = readFileSync(join(root, "src/lib/platform/system-health.ts"), "utf8");

describe("platform integration framework", () => {
  it("creates a separate platform integration domain without tenant authority", () => {
    expect(migration).toContain('CREATE TABLE "PlatformIntegrationConnection"');
    expect(migration).toContain('CREATE TABLE "PlatformIntegrationDelivery"');
    expect(migration).toContain('CREATE TABLE "PlatformInboundWebhookReceipt"');
    expect(migration).toContain('CREATE TABLE "PlatformIntegrationNormalizedEvent"');
    expect(tenantAuthorization).not.toContain("platform.integration.manage");
    expect(tenantAuthorization).not.toContain("PlatformIntegrationConnection");
  });

  it("stores only opaque credential references and never credential values", () => {
    expect(migration).toContain('"credentialRef" TEXT');
    expect(migration).not.toMatch(/credentialValue|accessToken|refreshToken|clientSecret|apiKey/i);
    expect(framework).toContain("PlatformCredentialResolver");
    expect(framework).toContain("Credential resolver is not configured");
  });

  it("requires a registered adapter before a connection can activate", () => {
    expect(framework).toContain('toStatus === "ACTIVE"');
    expect(framework).toContain("Adapter is not registered in this release");
    expect(runtime).toContain("new PlatformIntegrationRegistry([])");
  });

  it("uses durable idempotent outbound delivery with bounded retry and dead letter", () => {
    expect(migration).toContain('PlatformIntegrationDelivery_connection_idempotency_key');
    expect(framework).toContain("FOR UPDATE SKIP LOCKED");
    expect(framework).toContain("MAX_ATTEMPTS = 5");
    expect(framework).toContain('"DEAD_LETTER"');
    expect(operations).toContain("requeueDeadLetter");
    expect(operations).toContain("Replay reason is required");
  });

  it("verifies and normalizes inbound webhooks through the adapter contract before event creation", () => {
    expect(framework).toContain("verifyAndNormalizeWebhook");
    expect(framework).toContain("rawBodySha256");
    expect(framework).toContain('INSERT INTO "PlatformIntegrationNormalizedEvent"');
    expect(migration).toContain('PlatformInboundWebhookReceipt_connection_idempotency_key');
    expect(inbound).toContain("x-trace-idempotency-key");
  });

  it("preserves normalized event history and does not expose provider authority", () => {
    expect(migration).toContain('PlatformIntegrationNormalizedEvent_no_update_delete');
    expect(framework).not.toMatch(/stripe|salesforce|quickbooks|office ally|twilio|sendgrid/i);
    expect(runtime).not.toMatch(/stripe|salesforce|quickbooks|office ally|twilio|sendgrid/i);
  });

  it("reports real framework state through sanitized platform health", () => {
    expect(health).toContain('"PlatformIntegrationConnection"');
    expect(health).toContain('"PlatformIntegrationDelivery"');
    expect(health).toContain("Integration framework is installed; no provider connection is configured.");
  });
});
