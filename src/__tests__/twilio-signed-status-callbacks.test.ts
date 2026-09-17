import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TwilioSmsAdapter } from "@/lib/platform/twilio-sms-adapter";

const accountSid = ["AC", "0123456789abcdef0123456789abcdef"].join("");
const messageSid = ["SM", "0123456789abcdef0123456789abcdef"].join("");
const authToken = "synthetic-auth-token-for-tests-only";
const connectionId = "11111111-2222-4333-8444-555555555555";
const deliveryKey = "delivery-key-001";
const callbackUrl = `https://traceqms.com/api/platform/integrations/inbound/${connectionId}?deliveryKey=${deliveryKey}`;

function signature(url: string, parameters: Record<string, readonly string[]>) {
  const canonical = [url];
  for (const name of Object.keys(parameters).sort()) {
    for (const value of parameters[name]) canonical.push(name, value);
  }
  return createHmac("sha1", authToken).update(canonical.join(""), "utf8").digest("base64");
}

describe("Twilio signed status callbacks", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("adds a delivery-correlated StatusCallback URL to outbound SMS sends", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body ?? ""));
      expect(body.get("StatusCallback")).toBe(callbackUrl);
      return new Response(JSON.stringify({ sid: messageSid, status: "queued" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new TwilioSmsAdapter();
    const evidence = await adapter.deliver({
      connectionId,
      eventType: "twilio.sms.send",
      payload: { to: "+17145550123", body: "Status callback test" },
      configuration: { fromNumber: "+17145550124", callbackBaseUrl: "https://traceqms.com" },
      credential: JSON.stringify({ accountSid, authToken }),
      idempotencyKey: deliveryKey,
    });

    expect(evidence).toEqual({ providerObjectId: messageSid, providerOutcome: "TWILIO_QUEUED" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("verifies a signed form callback and preserves delivery correlation", async () => {
    const formParameters = {
      AccountSid: [accountSid],
      MessageSid: [messageSid],
      MessageStatus: ["delivered"],
    } as const;
    const headers = new Headers({ "x-twilio-signature": signature(callbackUrl, formParameters) });
    const adapter = new TwilioSmsAdapter();

    const normalized = await adapter.verifyAndNormalizeWebhook({
      rawBody: "AccountSid=unused",
      rawBodyBytes: new Uint8Array(),
      requestUrl: callbackUrl,
      formParameters,
      headers,
      configuration: { fromNumber: "+17145550124", callbackBaseUrl: "https://traceqms.com" },
      credential: JSON.stringify({ accountSid, authToken }),
    });

    expect(normalized.eventType).toBe("twilio.sms.status");
    expect(normalized.providerEventId).toBe(`${messageSid}:delivered`);
    expect(normalized.payload).toEqual({ deliveryKey, messageSid, messageStatus: "delivered", errorCode: null });
  });

  it("rejects callbacks whose signature or configured origin does not match", async () => {
    const formParameters = {
      AccountSid: [accountSid],
      MessageSid: [messageSid],
      MessageStatus: ["sent"],
    } as const;
    const adapter = new TwilioSmsAdapter();

    await expect(adapter.verifyAndNormalizeWebhook({
      rawBody: "",
      rawBodyBytes: new Uint8Array(),
      requestUrl: callbackUrl,
      formParameters,
      headers: new Headers({ "x-twilio-signature": "invalid" }),
      configuration: { fromNumber: "+17145550124", callbackBaseUrl: "https://traceqms.com" },
      credential: JSON.stringify({ accountSid, authToken }),
    })).rejects.toThrow("Twilio callback signature is invalid");

    const validHeaders = new Headers({ "x-twilio-signature": signature(callbackUrl, formParameters) });
    await expect(adapter.verifyAndNormalizeWebhook({
      rawBody: "",
      rawBodyBytes: new Uint8Array(),
      requestUrl: callbackUrl,
      formParameters,
      headers: validHeaders,
      configuration: { fromNumber: "+17145550124", callbackBaseUrl: "https://example.com" },
      credential: JSON.stringify({ accountSid, authToken }),
    })).rejects.toThrow("Twilio callback URL does not match the configured platform origin");
  });
});
