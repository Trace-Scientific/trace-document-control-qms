import fs from "node:fs";
import path from "node:path";

describe("provider delivery reconciliation hardening", () => {
  const migration = fs.readFileSync(path.join(process.cwd(), "prisma/migrations/20260916330000_platform_delivery_reconciliation/migration.sql"), "utf8");
  const framework = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/integration-framework.ts"), "utf8");
  const operations = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/integration-operations.ts"), "utf8");
  const health = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/system-health.ts"), "utf8");
  const reconcileRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/platform/integrations/deliveries/[deliveryId]/reconcile/route.ts"), "utf8");
  const stripe = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/stripe-adapter.ts"), "utf8");
  const quickbooks = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/quickbooks-adapter.ts"), "utf8");
  const salesforce = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/salesforce-adapter.ts"), "utf8");
  const sendgrid = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/sendgrid-email-adapter.ts"), "utf8");
  const twilio = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/twilio-sms-adapter.ts"), "utf8");
  const zendesk = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/zendesk-support-adapter.ts"), "utf8");

  it("adds a governed reconciliation state and provider evidence fields", () => {
    expect(migration).toContain("RECONCILIATION_REQUIRED");
    expect(migration).toContain('"providerRequestId" TEXT');
    expect(migration).toContain('"providerObjectId" TEXT');
    expect(migration).toContain('"providerOutcome" TEXT');
    expect(migration).toContain('"reconciledByMembershipId" UUID');
  });

  it("never automatically replays an abandoned processing lease", () => {
    expect(framework).toContain('"status"=\'RECONCILIATION_REQUIRED\'');
    expect(framework).toContain("STALE_PROCESSING_CLAIM");
    expect(framework).not.toContain('SET "status"=\'RETRY\',"claimedAt"=NULL,"claimedBy"=NULL,"availableAt"=CURRENT_TIMESTAMP WHERE "status"=\'PROCESSING\'');
  });

  it("requires an authorized and reasoned operator resolution", () => {
    expect(framework).toContain('permission: "platform.integration.manage"');
    expect(framework).toContain("CONFIRMED_SUCCEEDED");
    expect(framework).toContain("CONFIRMED_NOT_DELIVERED");
    expect(framework).toContain("ABANDON");
    expect(framework).toContain("platform.integration.delivery.reconciled");
    expect(reconcileRoute).toContain("authenticatePlatformRequest");
    expect(reconcileRoute).toContain("platformIntegrationService.reconcileDelivery");
  });

  it("exposes reconciliation evidence and degrades health while unresolved", () => {
    expect(operations).toContain('"providerRequestId","providerObjectId","providerOutcome","reconciliationReason","reconciledAt"');
    expect(health).toContain("reconciliationRequired");
    expect(health).toContain('"status"=\'RECONCILIATION_REQUIRED\'');
  });

  it("uses Stripe provider idempotency for safe transient retries", () => {
    expect(stripe).toContain('"Idempotency-Key": input.idempotencyKey');
    expect(stripe).toContain("PlatformIntegrationDeliveryRejectedError");
    expect(stripe).toContain("safe retry uses the same provider idempotency key");
  });

  it("captures provider correlation evidence on confirmed sends", () => {
    expect(quickbooks).toContain("providerObjectId");
    expect(salesforce).toContain("providerObjectId");
    expect(sendgrid).toContain("providerRequestId");
    expect(twilio).toContain("providerObjectId");
    expect(zendesk).toContain("providerObjectId");
  });

  it("routes ambiguous provider outcomes away from blind retry", () => {
    for (const adapter of [quickbooks, salesforce, sendgrid, twilio, zendesk]) {
      expect(adapter).toContain("provider outcome is ambiguous");
    }
    expect(framework).toContain("PROVIDER_OUTCOME_UNKNOWN");
  });
});
