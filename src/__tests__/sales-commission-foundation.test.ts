import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PlatformAuthorizationError } from "@/lib/platform/authorization";
import type { PlatformAuthorizationContext } from "@/lib/platform/authorization";
import { SalesCommissionService } from "@/lib/platform/sales-commissions";

const root = process.cwd();
const migration = readFileSync(join(root, "prisma/migrations/20260916210000_sales_commission_foundation/migration.sql"), "utf8");
const serviceSource = readFileSync(join(root, "src/lib/platform/sales-commissions.ts"), "utf8");
const tenantAuthorization = readFileSync(join(root, "src/lib/security/authorization.ts"), "utf8");
const paymentRoute = readFileSync(join(root, "src/app/api/platform/commissions/accruals/[commissionAccrualId]/payment/route.ts"), "utf8");

function context(grants: PlatformAuthorizationContext["grants"]): PlatformAuthorizationContext {
  return {
    platformIdentityId: "00000000-0000-4000-8000-000000000001",
    platformMembershipId: "00000000-0000-4000-8000-000000000002",
    identityStatus: "ACTIVE",
    membershipStatus: "ACTIVE",
    grants,
  };
}

describe("sales commission foundation", () => {
  it("keeps sales and commission authority outside tenant RBAC", () => {
    expect(migration).toContain('CREATE TABLE "SalesRepresentative"');
    expect(migration).toContain('CREATE TABLE "CommissionAccrual"');
    expect(migration).not.toMatch(/ALTER TABLE "Role"/);
    expect(migration).not.toMatch(/ALTER TABLE "Permission"/);
    expect(tenantAuthorization).not.toMatch(/commission|SalesRepresentative|platform.sales/i);
  });

  it("separates sales management from commission management", async () => {
    const service = new SalesCommissionService();
    await expect(service.createRepresentative(context(["platform.sales.read"]), {
      platformIdentityId: "00000000-0000-4000-8000-000000000010",
      displayName: "Synthetic Rep",
      reason: "Authorization regression test",
    })).rejects.toBeInstanceOf(PlatformAuthorizationError);
    expect(serviceSource).toContain('permission: "platform.sales.manage"');
    expect(serviceSource).toContain('permission: "platform.commission.manage"');
  });

  it("freezes active commission plan versions and their rules", () => {
    expect(migration).toContain('Active CommissionPlanVersion rows are immutable');
    expect(migration).toContain('Rules for active CommissionPlanVersion rows are immutable');
  });

  it("preserves the historical calculation identity on each accrual", () => {
    expect(migration).toContain('"commissionPlanVersionId" UUID NOT NULL');
    expect(migration).toContain('"commissionRuleId" UUID NOT NULL');
    expect(migration).toContain('"ruleSnapshot" JSONB NOT NULL');
    expect(migration).toContain('Commission accrual calculation basis is immutable');
  });

  it("uses compensating transactions instead of rewriting monetary history", () => {
    expect(migration).toContain('CREATE TABLE "CommissionAdjustment"');
    expect(migration).toContain('CREATE TABLE "CommissionPayment"');
    expect(migration).toContain('Commission history rows are append-only');
    expect(serviceSource).toContain('input.type === "REVERSAL" ? -Math.abs(input.amount)');
  });

  it("enforces the governed PENDING to EARNED to APPROVED to PAID lifecycle", () => {
    expect(serviceSource).toContain('PENDING: ["EARNED"]');
    expect(serviceSource).toContain('EARNED: ["APPROVED"]');
    expect(serviceSource).toContain('APPROVED: []');
    expect(serviceSource).toContain('"status" = \'PAID\'');
    expect(paymentRoute).toContain('service.recordPayment');
  });

  it("requires payment evidence for the PAID transition", () => {
    expect(serviceSource).toContain('INSERT INTO "CommissionPayment"');
    expect(serviceSource).toContain('INSERT INTO "CommissionPaymentItem"');
    expect(serviceSource).toContain('Only approved commission accruals can be paid');
  });

  it("does not introduce accounting or payroll provider authority", () => {
    expect(serviceSource).not.toMatch(/quickbooks|stripe|paypal|adp|gusto/i);
    expect(migration).not.toMatch(/quickbooks|stripe|paypal|adp|gusto/i);
  });
});
