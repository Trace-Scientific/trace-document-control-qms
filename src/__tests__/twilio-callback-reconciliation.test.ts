import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const inbound = readFileSync(join(process.cwd(), "src/lib/platform/integration-inbound.ts"), "utf8");

describe("Twilio callback-driven delivery reconciliation", () => {
  it("applies reconciliation only after normalized Twilio status verification", () => {
    expect(inbound).toContain('input.normalized.eventType !== "twilio.sms.status"');
    expect(inbound).toContain("applyVerifiedTwilioStatusCallback");
    expect(inbound).toContain("await adapter.verifyAndNormalizeWebhook");
    expect(inbound.indexOf("await adapter.verifyAndNormalizeWebhook")).toBeLessThan(inbound.indexOf("await applyVerifiedTwilioStatusCallback"));
  });

  it("correlates by governed connection and delivery key and locks the delivery", () => {
    expect(inbound).toContain('"connectionId"=${input.connectionId}::uuid AND "idempotencyKey"=${deliveryKey}');
    expect(inbound).toContain("FOR UPDATE");
    expect(inbound).toContain("Twilio callback does not match a governed outbound delivery");
  });

  it("rejects a callback whose Message SID conflicts with recorded provider evidence", () => {
    expect(inbound).toContain("delivery.providerObjectId && delivery.providerObjectId !== messageSid");
    expect(inbound).toContain("Twilio callback message SID does not match the outbound delivery");
  });

  it("resolves only ambiguous outbound state and never auto-retries downstream Twilio failure statuses", () => {
    expect(inbound).toContain('delivery.status === "RECONCILIATION_REQUIRED"');
    expect(inbound).toContain('"status"=\'SUCCEEDED\'');
    expect(inbound).not.toContain('"status"=\'RETRY\'');
    expect(inbound).toContain("TWILIO_SIGNED_CALLBACK_CONFIRMED_PROVIDER_ACCEPTANCE");
  });

  it("preserves provider status separately and writes append-only platform audit evidence", () => {
    expect(inbound).toContain("providerOutcome");
    expect(inbound).toContain("platform.integration.delivery.reconciled_by_provider_callback");
    expect(inbound).toContain("platform.integration.delivery.provider_status_observed");
    expect(inbound).toContain('INSERT INTO "PlatformAuditEvent"');
  });

  it("does not fabricate a human actor for provider-generated audit events", () => {
    const callbackAudit = inbound.slice(inbound.indexOf("platform.integration.delivery.reconciled_by_provider_callback"));
    expect(callbackAudit).not.toContain("actorIdentityId");
    expect(callbackAudit).not.toContain("actorMembershipId");
  });
});
