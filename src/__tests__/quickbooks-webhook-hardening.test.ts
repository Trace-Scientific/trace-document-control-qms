import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { QuickBooksAccountingAdapter } from "@/lib/platform/quickbooks-adapter";

const verifierToken = "synthetic-quickbooks-verifier-token";
const realmId = "1234567890";

function body() {
  return JSON.stringify({
    eventNotifications: [
      {
        realmId,
        dataChangeEvent: {
          entities: [
            {
              name: "Invoice",
              id: "42",
              operation: "Update",
              lastUpdated: "2026-09-19T12:00:00Z",
            },
          ],
        },
      },
    ],
  });
}

function signature(rawBodyBytes: Uint8Array) {
  return createHmac("sha256", verifierToken).update(rawBodyBytes).digest("base64");
}

describe("QuickBooks webhook hardening", () => {
  it("verifies the signature against exact raw request bytes", async () => {
    const rawBody = body();
    const rawBodyBytes = new TextEncoder().encode(rawBody);
    const adapter = new QuickBooksAccountingAdapter();

    const normalized = await adapter.verifyAndNormalizeWebhook({
      rawBody,
      rawBodyBytes,
      requestUrl: "https://traceqms.com/api/platform/integrations/inbound/11111111-2222-4333-8444-555555555555",
      headers: new Headers({ "intuit-signature": signature(rawBodyBytes) }),
      configuration: { environment: "sandbox" },
      credential: JSON.stringify({
        accessToken: "synthetic-access-token",
        realmId,
        webhookVerifierToken: verifierToken,
      }),
    });

    expect(normalized.eventType).toBe("quickbooks.accounting.data_change");
    expect(normalized.payload).toEqual({
      changes: [
        {
          realmId,
          name: "Invoice",
          id: "42",
          operation: "Update",
          lastUpdated: "2026-09-19T12:00:00Z",
        },
      ],
    });
  });

  it("rejects when decoded text is unchanged but the signed raw bytes differ", async () => {
    const rawBody = body();
    const signedBytes = new TextEncoder().encode(rawBody);
    const modifiedBytes = new Uint8Array([...signedBytes, 0x20]);
    const adapter = new QuickBooksAccountingAdapter();

    await expect(adapter.verifyAndNormalizeWebhook({
      rawBody,
      rawBodyBytes: modifiedBytes,
      requestUrl: "https://traceqms.com/api/platform/integrations/inbound/11111111-2222-4333-8444-555555555555",
      headers: new Headers({ "intuit-signature": signature(signedBytes) }),
      configuration: { environment: "sandbox" },
      credential: JSON.stringify({
        accessToken: "synthetic-access-token",
        realmId,
        webhookVerifierToken: verifierToken,
      }),
    })).rejects.toThrow("QuickBooks webhook signature is invalid");
  });

  it("rejects a realm mismatch before normalized accounting evidence is accepted", async () => {
    const rawBody = body();
    const rawBodyBytes = new TextEncoder().encode(rawBody);
    const adapter = new QuickBooksAccountingAdapter();

    await expect(adapter.verifyAndNormalizeWebhook({
      rawBody,
      rawBodyBytes,
      requestUrl: "https://traceqms.com/",
      headers: new Headers({ "intuit-signature": signature(rawBodyBytes) }),
      configuration: { environment: "sandbox" },
      credential: JSON.stringify({
        accessToken: "synthetic-access-token",
        realmId: "9999999999",
        webhookVerifierToken: verifierToken,
      }),
    })).rejects.toThrow("QuickBooks webhook realm does not match the configured company");
  });
});
