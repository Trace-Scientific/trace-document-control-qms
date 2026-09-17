import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const monitoring = readFileSync(join(process.cwd(), "src/lib/platform/twilio-delivery-monitoring.ts"), "utf8");
const route = readFileSync(join(process.cwd(), "src/app/api/platform/integrations/twilio/deliveries/poll/route.ts"), "utf8");
const health = readFileSync(join(process.cwd(), "src/lib/platform/system-health.ts"), "utf8");
const operations = readFileSync(join(process.cwd(), "src/lib/platform/integration-operations.ts"), "utf8");
const migration = readFileSync(join(process.cwd(), "prisma/migrations/20260917190000_twilio_delivery_status_polling/migration.sql"), "utf8");

describe("Twilio missed-callback recovery and delivery-status monitoring", () => {
  it("polls only governed Twilio send deliveries that already have a Message SID", () => {
    expect(monitoring).toContain("c.\"adapterKey\"='twilio.sms'");
    expect(monitoring).toContain("d.\"eventType\"='twilio.sms.send'");
    expect(monitoring).toContain("d.\"providerObjectId\" ~ '^SM[0-9A-Fa-f]{32}$'");
    expect(monitoring).toContain("d.\"status\" IN ('SUCCEEDED','RECONCILIATION_REQUIRED')");
  });

  it("uses provider GET status observation and contains no outbound send or replay path", () => {
    expect(monitoring).toContain("method: \"GET\"");
    expect(monitoring).toContain("/Messages/${encodeURIComponent(candidate.providerObjectId)}.json");
    expect(monitoring).not.toContain("enqueueOutbound");
    expect(monitoring).not.toContain("requeueDeadLetter");
    expect(monitoring).not.toContain('method: "POST"');
  });

  it("resolves ambiguity only when Twilio confirms the exact governed Message SID", () => {
    expect(monitoring).toContain("sid !== candidate.providerObjectId");
    expect(monitoring).toContain('current[0].status === "RECONCILIATION_REQUIRED"');
    expect(monitoring).toContain("TWILIO_PROVIDER_POLL_CONFIRMED_MESSAGE_EXISTS");
    expect(monitoring).toContain("platform.integration.delivery.reconciled_by_provider_poll");
  });

  it("preserves already-successful delivery timestamps while adding polling evidence", () => {
    expect(monitoring).toContain('WHERE "id"=${candidate.id}::uuid AND "status"=\'SUCCEEDED\'');
    expect(monitoring).toContain('"providerStatusCheckedAt"=CURRENT_TIMESTAMP');
    expect(monitoring).toContain('"providerStatusCheckCount"="providerStatusCheckCount"+1');
    expect(monitoring).not.toContain('SET "status"=\'RETRY\'');
  });

  it("records polling failures without changing retry eligibility", () => {
    expect(monitoring).toContain("platform.integration.delivery.provider_status_poll_failed");
    expect(monitoring).toContain("failed without changing delivery retry eligibility");
    expect(monitoring).toContain('"providerStatusError"=${statusError(message)}');
  });

  it("requires platform integration authority for the manual polling trigger", () => {
    expect(route).toContain("authenticatePlatformRequest");
    expect(route).toContain('permission: "platform.integration.manage"');
    expect(route).toContain("platformTwilioDeliveryMonitoringService.pollDue");
  });

  it("surfaces provider polling evidence and recent Twilio failures to operations", () => {
    expect(operations).toContain("providerStatusCheckedAt");
    expect(operations).toContain("providerStatusCheckCount");
    expect(operations).toContain("providerStatusError");
    expect(health).toContain("recentTwilioDeliveryFailures");
    expect(health).toContain("twilioStatusPollErrors");
  });

  it("adds bounded polling evidence fields without changing delivery-state enums", () => {
    expect(migration).toContain('ADD COLUMN "providerStatusCheckedAt" TIMESTAMPTZ');
    expect(migration).toContain('ADD COLUMN "providerStatusCheckCount" INTEGER NOT NULL DEFAULT 0');
    expect(migration).toContain('ADD COLUMN "providerStatusError" TEXT');
    expect(migration).not.toContain("ALTER TYPE \"PlatformIntegrationDeliveryStatus\"");
  });
});
