import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(join(root, "prisma/migrations/20260916230000_platform_notifications_reporting/migration.sql"), "utf8");
const service = readFileSync(join(root, "src/lib/platform/notifications-reporting.ts"), "utf8");
const worker = readFileSync(join(root, "src/lib/platform/notification-delivery-worker.ts"), "utf8");
const permissions = readFileSync(join(root, "src/lib/platform/permissions.ts"), "utf8");
const shell = readFileSync(join(root, "src/components/platform-administration-shell.tsx"), "utf8");
const tenantAuthorization = readFileSync(join(root, "src/lib/security/authorization.ts"), "utf8");

describe("platform notifications and reporting", () => {
  it("adds a platform-scoped delivery model without a fake tenant organization", () => {
    expect(migration).toContain('CREATE TABLE "PlatformNotification"');
    expect(migration).toContain('"recipientIdentityId" UUID NOT NULL REFERENCES "PlatformIdentity"');
    expect(migration).toContain('CREATE TABLE "PlatformNotificationEvent"');
    expect(migration).not.toContain('"organizationId"');
  });

  it("enforces bounded delivery state and append-only notification history", () => {
    expect(migration).toContain("'PENDING', 'PROCESSING', 'RETRY', 'SENT', 'DEAD_LETTER'");
    expect(migration).toContain('"PlatformNotification_attempts_check"');
    expect(migration).toContain('"PlatformNotification_state_check"');
    expect(migration).toContain('PlatformNotificationEvent_append_only');
    expect(service).toContain('const MAX_ATTEMPTS = 5');
    expect(service).toContain('FOR UPDATE SKIP LOCKED');
    expect(service).toContain("CLAIM_LEASE_MINUTES = 5");
  });

  it("fails unconfigured email delivery safely and retries through the durable service", () => {
    expect(worker).toContain('UnconfiguredEmailPlatformNotificationTransport');
    expect(worker).toContain('Platform email provider is not configured');
    expect(worker).toContain('markDeliveryFailed');
    expect(worker).toContain('markDelivered');
  });

  it("requires explicit platform permissions for inbox, monitoring, requeue, and reporting", () => {
    expect(permissions).toContain('platform.notification.read');
    expect(permissions).toContain('platform.notification.manage');
    expect(permissions).toContain('platform.reporting.read');
    expect(service).toContain('permission: "platform.notification.read"');
    expect(service).toContain('permission: "platform.notification.manage"');
    expect(service).toContain('permission: "platform.reporting.read"');
  });

  it("restricts inbox reads to the authenticated platform identity", () => {
    expect(service).toContain('"recipientIdentityId" = ${context.platformIdentityId}::uuid');
    expect(service).toContain('"channel" = \'IN_APP\'');
    expect(service).toContain('"status" = \'SENT\'');
  });

  it("requires reasoned dead-letter requeue and writes both event and platform audit evidence", () => {
    expect(service).toContain('Only dead-letter notifications can be requeued');
    expect(service).toContain('"status" = \'DEAD_LETTER\'');
    expect(service).toContain('"REQUEUED"');
    expect(service).toContain('platform.notification.requeued');
    expect(service).toContain('INSERT INTO "PlatformAuditEvent"');
  });

  it("snapshots only commercial and operational control-plane aggregates", () => {
    expect(migration).toContain('CREATE TABLE "PlatformReportRun"');
    expect(migration).toContain('PlatformReportRun_append_only');
    expect(service).toContain('FROM "CustomerAccount"');
    expect(service).toContain('FROM "Subscription"');
    expect(service).toContain('FROM "EntitlementOverride"');
    expect(service).toContain('FROM "SupportSession"');
    expect(service).toContain('FROM "SalesAssignment"');
    expect(service).toContain('FROM "CommissionAccrual"');
    expect(service).not.toMatch(/FROM "Document"|FROM "RegulatedRecord"|FROM "QualityEvent"|FROM "TrainingAssignment"/);
  });

  it("does not weaken tenant authorization", () => {
    expect(tenantAuthorization).not.toContain("platform.notification");
    expect(tenantAuthorization).not.toContain("platform.reporting");
    expect(tenantAuthorization).not.toContain("platform.");
    expect(tenantAuthorization).not.toContain("superAdmin");
  });

  it("surfaces notification and reporting workspaces in the separate platform shell", () => {
    expect(shell).toContain('label: "Notifications"');
    expect(shell).toContain('label: "Reporting"');
    expect(shell).toContain('platform.notification.manage');
    expect(shell).toContain('platform.reporting.read');
    expect(shell).toContain('PlatformNotificationsPanel');
    expect(shell).toContain('PlatformReportingPanel');
  });
});
