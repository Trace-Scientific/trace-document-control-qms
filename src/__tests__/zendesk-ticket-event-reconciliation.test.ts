import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZendeskSupportAdapter } from "@/lib/platform/zendesk-support-adapter";

const secret = "synthetic-zendesk-signing-secret";
const deliveryKey = "zendesk-delivery-key-001";
const ticketId = "5158";

function webhookBody(type = "zen:event-type:ticket.created") {
  return JSON.stringify({
    account_id: 22129848,
    id: "cbe4028c-7239-495d-b020-f22348516046",
    type,
    time: "2026-09-18T13:00:00Z",
    detail: {
      id: ticketId,
      external_id: `trace-delivery:${deliveryKey}`,
      status: "OPEN",
      subject: "Synthetic support request",
      description: "Synthetic only",
    },
  });
}

function headers(body: string, timestamp = new Date().toISOString()) {
  return new Headers({
    "x-zendesk-webhook-signature-timestamp": timestamp,
    "x-zendesk-webhook-signature": createHmac("sha256", secret).update(timestamp + body, "utf8").digest("base64"),
  });
}

describe("Zendesk signed ticket-event reconciliation boundary", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("forces an opaque Trace delivery key into ticket external_id", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        ticket: { external_id?: string; comment?: { public?: boolean } };
      };
      expect(body.ticket.external_id).toBe(`trace-delivery:${deliveryKey}`);
      expect(body.ticket.comment?.public).toBe(false);
      return new Response(JSON.stringify({ ticket: { id: ticketId } }), {
        status: 201,
        headers: { "content-type": "application/json", "x-request-id": "request-001" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new ZendeskSupportAdapter();
    const evidence = await adapter.deliver({
      eventType: "zendesk.ticket.create",
      payload: { subject: "Synthetic", comment: "Synthetic only", priority: "normal" },
      configuration: {},
      credential: JSON.stringify({
        subdomain: "synthetic",
        email: "platform@example.com",
        apiToken: "synthetic-api-token",
        webhookSigningSecret: secret,
      }),
      idempotencyKey: deliveryKey,
    });

    expect(evidence).toEqual({
      providerRequestId: "request-001",
      providerObjectId: ticketId,
      providerOutcome: "ZENDESK_CONFIRMED_CREATED",
    });
  });

  it("verifies the signed native ticket event and normalizes only bounded status evidence", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-18T13:00:00Z"));
    const body = webhookBody();
    const adapter = new ZendeskSupportAdapter();

    const normalized = await adapter.verifyAndNormalizeWebhook({
      rawBody: body,
      headers: headers(body, "2026-09-18T13:00:00Z"),
      configuration: {},
      credential: JSON.stringify({
        subdomain: "synthetic",
        email: "platform@example.com",
        apiToken: "synthetic-api-token",
        webhookSigningSecret: secret,
      }),
    });

    expect(normalized.eventType).toBe("zendesk.ticket.delivery_status");
    expect(normalized.providerEventId).toBe("cbe4028c-7239-495d-b020-f22348516046");
    expect(normalized.payload).toEqual({
      deliveryKey,
      ticketId,
      ticketStatus: "OPEN",
      zendeskEventType: "zen:event-type:ticket.created",
    });
    expect(JSON.stringify(normalized.payload)).not.toContain("Synthetic support request");
  });

  it("rejects stale signatures, unsupported events, and non-Trace external IDs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-18T13:10:00Z"));
    const adapter = new ZendeskSupportAdapter();
    const credential = JSON.stringify({
      subdomain: "synthetic",
      email: "platform@example.com",
      apiToken: "synthetic-api-token",
      webhookSigningSecret: secret,
    });

    const body = webhookBody();
    await expect(adapter.verifyAndNormalizeWebhook({
      rawBody: body,
      headers: headers(body, "2026-09-18T13:00:00Z"),
      configuration: {},
      credential,
    })).rejects.toThrow("Zendesk webhook timestamp is outside the allowed replay window");

    vi.setSystemTime(new Date("2026-09-18T13:00:00Z"));
    const unsupported = webhookBody("zen:event-type:ticket.subject_changed");
    await expect(adapter.verifyAndNormalizeWebhook({
      rawBody: unsupported,
      headers: headers(unsupported, "2026-09-18T13:00:00Z"),
      configuration: {},
      credential,
    })).rejects.toThrow("Zendesk webhook event type is not supported");

    const unmanaged = JSON.stringify({
      id: "event-2",
      type: "zen:event-type:ticket.created",
      detail: { id: ticketId, external_id: "customer-owned-value", status: "OPEN" },
    });
    await expect(adapter.verifyAndNormalizeWebhook({
      rawBody: unmanaged,
      headers: headers(unmanaged, "2026-09-18T13:00:00Z"),
      configuration: {},
      credential,
    })).rejects.toThrow("Zendesk ticket external ID is not Trace-managed");
  });
});
