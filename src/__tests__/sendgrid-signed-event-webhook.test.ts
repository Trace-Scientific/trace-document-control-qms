import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SendGridEmailAdapter } from "@/lib/platform/sendgrid-email-adapter";

const deliveryKey = "sendgrid-delivery-key-001";
const timestamp = "1789716000";

function keys() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    privateKey,
  };
}

function signedHeaders(rawBody: Uint8Array, privateKey: ReturnType<typeof keys>["privateKey"]) {
  const signedPayload = Buffer.concat([Buffer.from(timestamp, "utf8"), Buffer.from(rawBody)]);
  const signature = sign("sha256", signedPayload, privateKey).toString("base64");
  return new Headers({
    "x-twilio-email-event-webhook-signature": signature,
    "x-twilio-email-event-webhook-timestamp": timestamp,
  });
}

describe("SendGrid signed Event Webhook", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("adds non-PII delivery correlation as v3 custom_args", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        personalizations: Array<{ custom_args?: Record<string, string> }>;
      };
      expect(body.personalizations[0].custom_args).toEqual({ trace_delivery_key: deliveryKey });
      return new Response("", { status: 202, headers: { "x-message-id": "sendgrid-request-001" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new SendGridEmailAdapter();
    const evidence = await adapter.deliver({
      eventType: "sendgrid.email.send",
      payload: { to: "synthetic@example.com", subject: "Synthetic", text: "Synthetic only" },
      configuration: { region: "global", fromEmail: "sender@example.com" },
      credential: JSON.stringify({ apiKey: "SG.synthetic-key-for-tests" }),
      idempotencyKey: deliveryKey,
    });

    expect(evidence).toEqual({ providerRequestId: "sendgrid-request-001", providerOutcome: "SENDGRID_ACCEPTED" });
  });

  it("verifies ECDSA over timestamp plus exact raw bytes and normalizes delivery events", async () => {
    const { publicKey, privateKey } = keys();
    const body = JSON.stringify([
      {
        event: "delivered",
        sg_event_id: "event-001",
        sg_message_id: "message-001",
        trace_delivery_key: deliveryKey,
        email: "synthetic@example.com",
      },
    ]);
    const rawBodyBytes = new TextEncoder().encode(body);
    const adapter = new SendGridEmailAdapter();

    const normalized = await adapter.verifyAndNormalizeWebhook({
      rawBody: body,
      rawBodyBytes,
      requestUrl: "https://traceqms.com/api/platform/integrations/inbound/11111111-2222-4333-8444-555555555555",
      headers: signedHeaders(rawBodyBytes, privateKey),
      configuration: { region: "global", fromEmail: "sender@example.com", webhookPublicKey: publicKey },
      credential: JSON.stringify({ apiKey: "SG.synthetic-key-for-tests" }),
    });

    expect(normalized.eventType).toBe("sendgrid.email.delivery_status");
    expect(normalized.providerEventId).toBe("event-001");
    expect(normalized.payload).toEqual({
      events: [{ deliveryKey, eventType: "delivered", eventId: "event-001", messageId: "message-001" }],
    });
  });

  it("rejects modified bytes and unsupported engagement events", async () => {
    const { publicKey, privateKey } = keys();
    const original = JSON.stringify([
      { event: "delivered", sg_event_id: "event-001", sg_message_id: "message-001", trace_delivery_key: deliveryKey },
    ]);
    const originalBytes = new TextEncoder().encode(original);
    const modified = original.replace("delivered", "processed");
    const adapter = new SendGridEmailAdapter();

    await expect(adapter.verifyAndNormalizeWebhook({
      rawBody: modified,
      rawBodyBytes: new TextEncoder().encode(modified),
      requestUrl: "https://traceqms.com/api/platform/integrations/inbound/11111111-2222-4333-8444-555555555555",
      headers: signedHeaders(originalBytes, privateKey),
      configuration: { region: "global", fromEmail: "sender@example.com", webhookPublicKey: publicKey },
      credential: JSON.stringify({ apiKey: "SG.synthetic-key-for-tests" }),
    })).rejects.toThrow("SendGrid webhook signature is invalid");

    const engagement = JSON.stringify([
      { event: "open", sg_event_id: "event-002", sg_message_id: "message-001", trace_delivery_key: deliveryKey },
    ]);
    const engagementBytes = new TextEncoder().encode(engagement);
    await expect(adapter.verifyAndNormalizeWebhook({
      rawBody: engagement,
      rawBodyBytes: engagementBytes,
      requestUrl: "https://traceqms.com/api/platform/integrations/inbound/11111111-2222-4333-8444-555555555555",
      headers: signedHeaders(engagementBytes, privateKey),
      configuration: { region: "global", fromEmail: "sender@example.com", webhookPublicKey: publicKey },
      credential: JSON.stringify({ apiKey: "SG.synthetic-key-for-tests" }),
    })).rejects.toThrow("SendGrid webhook event type is not supported");
  });
});
