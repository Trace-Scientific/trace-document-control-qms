import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PlatformAuthorizationError } from "@/lib/platform/authorization";
import type { PlatformAuthorizationContext } from "@/lib/platform/authorization";
import { SubscriptionCatalogService } from "@/lib/platform/subscriptions";

const root = process.cwd();
const migration = readFileSync(join(root, "prisma/migrations/20260916200000_product_plan_subscription_entitlements/migration.sql"), "utf8");
const serviceSource = readFileSync(join(root, "src/lib/platform/subscriptions.ts"), "utf8");
const tenantAuthorization = readFileSync(join(root, "src/lib/security/authorization.ts"), "utf8");
const subscriptionRoute = readFileSync(join(root, "src/app/api/platform/subscriptions/[subscriptionId]/route.ts"), "utf8");

function context(grants: PlatformAuthorizationContext["grants"]): PlatformAuthorizationContext {
  return {
    platformIdentityId: "00000000-0000-4000-8000-000000000001",
    platformMembershipId: "00000000-0000-4000-8000-000000000002",
    identityStatus: "ACTIVE",
    membershipStatus: "ACTIVE",
    grants,
  };
}

describe("product plan subscription entitlement foundation", () => {
  it("keeps commercial entitlements separate from tenant RBAC", () => {
    expect(migration).toContain('CREATE TABLE "Subscription"');
    expect(migration).toContain('CREATE TABLE "EntitlementOverride"');
    expect(migration).not.toMatch(/ALTER TABLE "Role"/);
    expect(migration).not.toMatch(/ALTER TABLE "Permission"/);
    expect(migration).not.toMatch(/ALTER TABLE "RolePermission"/);
    expect(migration).not.toMatch(/ALTER TABLE "UserRole"/);
    expect(tenantAuthorization).not.toMatch(/entitlement|subscription|PlatformPermission/i);
  });

  it("versions plans and freezes activated configuration", () => {
    expect(migration).toContain('CREATE TABLE "PlanVersion"');
    expect(migration).toContain('CREATE TABLE "PlanFeature"');
    expect(migration).toContain('Active PlanVersion rows are immutable; create a new version');
    expect(migration).toContain('Features for an active PlanVersion are immutable');
  });

  it("preserves append-only subscription history", () => {
    expect(migration).toContain('CREATE TABLE "SubscriptionChange"');
    expect(migration).toContain('SubscriptionChange rows are append-only');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON "SubscriptionChange"');
    expect(migration).toContain('REFERENCES "Subscription"("id") ON DELETE RESTRICT');
  });

  it("requires commercial management permission before catalog writes", async () => {
    const service = new SubscriptionCatalogService();
    await expect(service.createProduct(context(["platform.subscription.read"]), {
      code: "SYNTHETIC",
      name: "Synthetic Product",
      reason: "Authorization regression test",
    })).rejects.toBeInstanceOf(PlatformAuthorizationError);
  });

  it("separates entitlement override authority from subscription management", () => {
    expect(serviceSource).toContain('permission: "platform.entitlement.manage"');
    expect(serviceSource).toContain('permission: "platform.subscription.manage"');
  });

  it("resolves explicit active overrides before plan-derived entitlements", () => {
    const overridePosition = serviceSource.indexOf('FROM "EntitlementOverride"');
    const planPosition = serviceSource.indexOf('FROM "Subscription" s');
    expect(overridePosition).toBeGreaterThan(-1);
    expect(planPosition).toBeGreaterThan(overridePosition);
    expect(serviceSource).toContain('source: overrides[0].decision === "ENABLE" ? "OVERRIDE_ENABLE" : "OVERRIDE_DISABLE"');
  });

  it("requires an active customer, active subscription, active plan version, and active feature", () => {
    expect(serviceSource).toContain('WHERE "organizationId" = ${organizationId}::uuid AND "status" = \'ACTIVE\'');
    expect(serviceSource).toContain('AND s."status" = \'ACTIVE\'');
    expect(serviceSource).toContain('AND pv."status" = \'ACTIVE\'');
    expect(serviceSource).toContain('AND f."status" = \'ACTIVE\'');
  });

  it("uses optimistic locking for subscription lifecycle changes", () => {
    expect(serviceSource).toContain('existing.lockVersion !== input.expectedLockVersion');
    expect(serviceSource).toContain('"lockVersion" = "lockVersion" + 1');
    expect(subscriptionRoute).not.toMatch(/export async function DELETE/);
  });

  it("keeps providers out of runtime entitlement authority", () => {
    expect(serviceSource).not.toMatch(/stripe|quickbooks|paypal|braintree/i);
    expect(migration).not.toMatch(/stripe|quickbooks|paypal|braintree/i);
  });
});