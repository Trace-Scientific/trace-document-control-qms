import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const inbound = readFileSync(join(process.cwd(), "src/lib/platform/integration-inbound.ts"), "utf8");

describe("SendGrid callback-driven delivery reconciliation", () => {
  it("applies SendGrid reconciliation only after provider verification", () => {
    expect(inbound).toContain('input.normalized.eventType !== "sendgrid.email.delivery_status"');
    expect(inbound).toContain("applyVerifiedSendGridStatusCallback");
    expect(inbound).toContain("await adapter.verifyAndNormalizeWebhook");
    expect(inbound.indexOf("await adapter.verifyAndNormalizeWebhook")).toBeLessThan(inbound.indexOf("await applyVerifiedSendGridStatusCallback"));
  });

  it("correlates signed events to the governed outbound delivery key", () => {
    expect(inbound).toContain('"connectionId"=${input.connectionId}::uuid AND "idempotencyKey"=${deliveryKey}');
    expect(inbound).toContain("SendGrid callback does not match a governed outbound delivery");
    expect(inbound).toContain("FOR UPDATE");
  });

  it("does not allow a different provider message ID to replace recorded evidence", () => {
    expect(inbound).toContain("delivery.providerObjectId && delivery.providerObjectId !== messageId");
    expect(inbound).toContain("SendGrid callback message ID does not match the outbound delivery");
  });

  it("resolves ambiguous request state without automatic retry or resend", () => {
    expect(inbound).toContain("SENDGRID_SIGNED_EVENT_CONFIRMED_PROVIDER_ACCEPTANCE");
    expect(inbound).toContain('delivery.status === "RECONCILIATION_REQUIRED"');
    const sendgridSlice = inbound.slice(inbound.indexOf("async function applyVerifiedSendGridStatusCallback"));
    expect(sendgridSlice).not.toContain('"status"=\'RETRY\'');
    expect(sendgridSlice).not.toContain("enqueueOutbound");
  });

  it("preserves downstream provider outcome and append-only audit evidence", () => {
    expect(inbound).toContain('provider: "sendgrid"');
    expect(inbound).toContain("platform.integration.delivery.reconciled_by_provider_callback");
    expect(inbound).toContain("platform.integration.delivery.provider_status_observed");
    expect(inbound).toContain("SENDGRID_");
  });
});
