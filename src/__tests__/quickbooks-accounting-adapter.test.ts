import fs from "node:fs";
import path from "node:path";

describe("QuickBooks accounting adapter governance", () => {
  const qbo = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/quickbooks-adapter.ts"), "utf8");
  const runtime = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/integration-runtime.ts"), "utf8");

  it("registers QuickBooks only through reviewed runtime composition", () => {
    expect(runtime).toContain("new QuickBooksAccountingAdapter()");
    expect(runtime).toContain("new StripeBillingAdapter()");
  });

  it("keeps QuickBooks credentials outside application data", () => {
    expect(qbo).not.toContain("clientSecret:");
    expect(qbo).not.toContain("refreshToken:");
    expect(qbo).not.toContain("DATABASE_URL");
    expect(qbo).toContain("QuickBooks credential bundle is required");
  });

  it("restricts outbound accounting operations and destinations", () => {
    expect(qbo).toContain('"quickbooks.customer.create"');
    expect(qbo).toContain('"quickbooks.invoice.create"');
    expect(qbo).toContain('"quickbooks.payment.create"');
    expect(qbo).toContain('"https://quickbooks.api.intuit.com"');
    expect(qbo).toContain('"https://sandbox-quickbooks.api.intuit.com"');
    expect(qbo).toContain("QuickBooks outbound event type is not allowed");
  });

  it("propagates platform idempotency into the QuickBooks request", () => {
    expect(qbo).toContain('"Request-Id": input.idempotencyKey.slice(0, 50)');
  });

  it("verifies the Intuit webhook signature before parsing changes", () => {
    expect(qbo).toContain('input.headers.get("intuit-signature")');
    expect(qbo).toContain('createHmac("sha256", verifierToken).update(rawBody, "utf8").digest("base64")');
    expect(qbo).toContain("timingSafeEqual");
    expect(qbo.indexOf("verifySignature(input.rawBody")).toBeLessThan(qbo.indexOf("normalizeWebhook(input.rawBody"));
  });

  it("bounds webhook entities and requires configured realm identity", () => {
    expect(qbo).toContain('new Set(["Customer", "Invoice", "Payment", "CreditMemo", "Estimate"])');
    expect(qbo).toContain("QuickBooks webhook realm does not match the configured company");
    expect(qbo).toContain('eventType: "quickbooks.accounting.data_change"');
  });

  it("does not grant QuickBooks authorization authority", () => {
    expect(qbo).not.toContain("AuthorizationContext");
    expect(qbo).not.toContain("RolePermission");
    expect(qbo).not.toContain("PlatformPermission");
  });
});
