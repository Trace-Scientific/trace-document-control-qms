import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PlatformAuthorizationError } from "@/lib/platform/authorization";
import { CustomerAccountService } from "@/lib/platform/customer-accounts";
import type { PlatformAuthorizationContext } from "@/lib/platform/authorization";

const root = process.cwd();
const migration = readFileSync(
  join(root, "prisma/migrations/20260916190000_customer_account_foundation/migration.sql"),
  "utf8",
);
const serviceSource = readFileSync(join(root, "src/lib/platform/customer-accounts.ts"), "utf8");
const collectionRoute = readFileSync(join(root, "src/app/api/platform/customers/route.ts"), "utf8");
const detailRoute = readFileSync(
  join(root, "src/app/api/platform/customers/[customerAccountId]/route.ts"),
  "utf8",
);

function context(grants: PlatformAuthorizationContext["grants"]): PlatformAuthorizationContext {
  return {
    platformIdentityId: "00000000-0000-4000-8000-000000000001",
    platformMembershipId: "00000000-0000-4000-8000-000000000002",
    identityStatus: "ACTIVE",
    membershipStatus: "ACTIVE",
    grants,
  };
}

describe("customer account foundation", () => {
  it("keeps the commercial account separate from the tenant Organization table", () => {
    expect(migration).toContain('CREATE TABLE "CustomerAccount"');
    expect(migration).toContain('REFERENCES "Organization"("id") ON DELETE RESTRICT');
    expect(migration).not.toMatch(/ALTER TABLE "Organization"/);
    expect(migration).not.toMatch(/DROP TABLE "Organization"/);
    expect(migration).not.toMatch(/DELETE FROM "Organization"/);
  });

  it("enforces at most one customer account for a tenant organization", () => {
    expect(migration).toContain('CREATE UNIQUE INDEX "CustomerAccount_organizationId_key"');
    expect(migration).toContain('WHERE "organizationId" IS NOT NULL');
    expect(serviceSource).toContain("Tenant organization is already bound to another customer account");
    expect(serviceSource).toContain("A bound tenant organization cannot be reassigned or cleared");
  });

  it("makes customer lifecycle history append-only", () => {
    expect(migration).toContain('CREATE TABLE "CustomerAccountStatusEvent"');
    expect(migration).toContain('CustomerAccountStatusEvent rows are append-only');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON "CustomerAccountStatusEvent"');
    expect(migration).toContain('FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE RESTRICT');
  });

  it("does not expose a hard-delete customer route", () => {
    expect(collectionRoute).not.toMatch(/export async function DELETE/);
    expect(detailRoute).not.toMatch(/export async function DELETE/);
    expect(serviceSource).not.toMatch(/DELETE FROM "CustomerAccount"/);
  });

  it("requires platform read permission before listing customers", async () => {
    const service = new CustomerAccountService();
    await expect(service.list(context([]))).rejects.toBeInstanceOf(PlatformAuthorizationError);
  });

  it("requires platform manage permission before creating customers", async () => {
    const service = new CustomerAccountService();
    await expect(service.create(context(["platform.organization.read"]), {
      accountCode: "SYNTH-001",
      legalName: "Synthetic Customer LLC",
      displayName: "Synthetic Customer",
      reason: "Synthetic authorization regression test",
    })).rejects.toBeInstanceOf(PlatformAuthorizationError);
  });

  it("requires a tenant binding before an account can become active", () => {
    expect(serviceSource).toContain('input.toStatus === "ACTIVE" && existing.organizationId === null');
    expect(serviceSource).toContain("An active customer account must be bound to a tenant organization");
  });

  it("requires elevated suspension permission for suspension, restoration, and termination", () => {
    expect(serviceSource).toContain('toStatus === "SUSPENDED"');
    expect(serviceSource).toContain('toStatus === "TERMINATED"');
    expect(serviceSource).toContain('fromStatus === "SUSPENDED"');
    expect(serviceSource).toContain('permission: sensitive ? "platform.organization.suspend" : "platform.organization.manage"');
  });

  it("writes both lifecycle history and platform audit records", () => {
    expect(serviceSource).toContain('INSERT INTO "CustomerAccountStatusEvent"');
    expect(serviceSource).toContain('INSERT INTO "PlatformAuditEvent"');
    expect(serviceSource).toContain('customer_account.created');
    expect(serviceSource).toContain('customer_account.updated');
    expect(serviceSource).toContain('customer_account.status_changed');
  });
});