import fs from "node:fs";
import path from "node:path";

describe("Stripe billing adapter governance", () => {
  const stripe = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/stripe-adapter.ts"), "utf8");
  const runtime = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/integration-runtime.ts"), "utf8");
  const framework = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/integration-framework.ts"), "utf8");
  const inbound = fs.readFileSync(path.join(process.cwd(), "src/app/api/platform/integrations/inbound/[connectionId]/route.ts"), "utf8");
  const resolver = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/environment-credential-resolver.ts"), "utf8");

  it("registers Stripe only through the reviewed platform integration runtime", () => {
    expect(runtime).toContain("new StripeBillingAdapter()");
    expect(runtime).toContain("EnvironmentPlatformCredentialResolver");
  });

  it("keeps provider credentials outside application data", () => {
    expect(resolver).toContain("env:(TRACE_INTEGRATION_");
    expect(resolver).not.toContain("DATABASE_URL");
    expect(stripe).not.toContain("sk_live_example");
    expect(stripe).not.toContain("whsec_example");
  });

  it("passes the persisted platform idempotency key to provider adapters", () => {
    expect(framework).toContain("idempotencyKey: string");
    expect(framework).toContain("idempotencyKey: claim.idempotencyKey");
    expect(stripe).toContain('"Idempotency-Key": input.idempotencyKey');
  });

  it("verifies Stripe signatures against the exact raw body before normalization", () => {
    expect(stripe).toContain('input.headers.get("stripe-signature")');
    expect(stripe).toContain('update(`${timestamp}.${rawBody}`, "utf8")');
    expect(stripe).toContain("timingSafeEqual");
    expect(stripe.indexOf("verifyStripeSignature")).toBeLessThan(stripe.indexOf("JSON.parse(input.rawBody)"));
  });

  it("bounds accepted Stripe inbound event types", () => {
    expect(stripe).toContain('"customer.subscription.created"');
    expect(stripe).toContain('"customer.subscription.updated"');
    expect(stripe).toContain('"customer.subscription.deleted"');
    expect(stripe).toContain('"invoice.paid"');
    expect(stripe).toContain('"invoice.payment_failed"');
  });

  it("derives an inbound idempotency key from the raw body if the provider sends no Trace key", () => {
    expect(inbound).toContain('`sha256:${createHash("sha256").update(rawBody, "utf8").digest("hex")}`');
  });

  it("does not grant Stripe tenant or platform authorization authority", () => {
    expect(stripe).not.toContain("AuthorizationContext");
    expect(stripe).not.toContain("RolePermission");
    expect(stripe).not.toContain("PlatformPermission");
  });
});
