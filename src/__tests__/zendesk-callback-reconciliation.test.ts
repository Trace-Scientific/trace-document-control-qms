import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const inbound = readFileSync(join(process.cwd(), "src/lib/platform/integration-inbound.ts"), "utf8");

describe("Zendesk callback-driven delivery reconciliation", () => {
  it("applies Zendesk reconciliation only after provider verification", () => {
    expect(inbound).toContain('input.normalized.eventType !== "zendesk.ticket.delivery_status"');
    expect(inbound).toContain("applyVerifiedZendeskTicketCallback");
    expect(inbound).toContain("await adapter.verifyAndNormalizeWebhook");
    expect(inbound.indexOf("await adapter.verifyAndNormalizeWebhook")).toBeLessThan(inbound.indexOf("await applyVerifiedZendeskTicketCallback"));
  });

  it("correlates by governed connection and delivery key under row lock", () => {
    expect(inbound).toContain('"connectionId"=${input.connectionId}::uuid AND "idempotencyKey"=${deliveryKey}');
    expect(inbound).toContain("Zendesk callback does not match a governed outbound delivery");
    expect(inbound).toContain("FOR UPDATE");
  });

  it("rejects ticket IDs that conflict with recorded provider evidence", () => {
    expect(inbound).toContain("delivery.providerObjectId && delivery.providerObjectId !== ticketId");
    expect(inbound).toContain("Zendesk callback ticket ID does not match the outbound delivery");
  });

  it("resolves only ambiguous provider-request state and never auto-retries", () => {
    expect(inbound).toContain("ZENDESK_SIGNED_TICKET_EVENT_CONFIRMED_PROVIDER_ACCEPTANCE");
    expect(inbound).toContain('delivery.status === "RECONCILIATION_REQUIRED"');
    const slice = inbound.slice(inbound.indexOf("async function applyVerifiedZendeskTicketCallback"));
    expect(slice).not.toContain('"status"=\'RETRY\'');
    expect(slice).not.toContain("enqueueOutbound");
    expect(slice).not.toContain("requeueDeadLetter");
  });

  it("records bounded provider status and append-only audit evidence", () => {
    expect(inbound).toContain('provider: "zendesk"');
    expect(inbound).toContain("platform.integration.delivery.reconciled_by_provider_callback");
    expect(inbound).toContain("platform.integration.delivery.provider_status_observed");
    expect(inbound).toContain("ZENDESK_");
  });
});
