import { Prisma } from "@prisma/client";
import { db } from "../db";
import type { PlatformAuthorizationContext } from "./authorization";
import { requirePlatformAuthorization } from "./authorization";

export type HealthState = "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "NOT_CONFIGURED";

export interface PlatformSystemHealthSnapshot {
  checkedAt: string;
  overall: HealthState;
  application: { readiness: HealthState; releaseIdentity: string | null; environmentClass: "DEVELOPMENT_PREVIEW" | "PROTECTED_VALIDATION" | "PRODUCTION" | "LOCAL_OR_UNKNOWN" };
  database: { connectivity: HealthState; latestMigration: string | null; latestMigrationFinishedAt: string | null; failedMigrationCount: number };
  backgroundJobs: { notificationDelivery: HealthState; pending: number; retry: number; processing: number; deadLetter: number; oldestAvailableAt: string | null; staleProcessing: number };
  scheduledTasks: { status: HealthState; detail: string };
  integrations: { status: HealthState; detail: string };
}

interface MigrationRow { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }
interface NotificationHealthRow { pending: bigint; retry: bigint; processing: bigint; deadLetter: bigint; staleProcessing: bigint; oldestAvailableAt: Date | null }
interface IntegrationHealthRow {
  activeConnections: bigint;
  suspendedConnections: bigint;
  retryDeliveries: bigint;
  deadLetterDeliveries: bigint;
  reconciliationRequired: bigint;
  staleProcessing: bigint;
  recentTwilioDeliveryFailures: bigint;
  twilioStatusPollErrors: bigint;
}

function releaseIdentity(): string | null {
  const candidate = process.env.APP_RELEASE_SHA ?? process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? null;
  if (!candidate) return null;
  const normalized = candidate.trim();
  if (!/^[A-Za-z0-9._-]{7,128}$/.test(normalized)) return null;
  return normalized.slice(0, 40);
}

function environmentClass(): PlatformSystemHealthSnapshot["application"]["environmentClass"] {
  const explicit = (process.env.TRACE_ENVIRONMENT_CLASS ?? "").toUpperCase();
  if (explicit === "PRODUCTION") return "PRODUCTION";
  if (explicit === "PROTECTED_VALIDATION") return "PROTECTED_VALIDATION";
  if (explicit === "DEVELOPMENT_PREVIEW") return "DEVELOPMENT_PREVIEW";
  if (process.env.RAILWAY_ENVIRONMENT_ID || process.env.RAILWAY_PROJECT_ID) return "DEVELOPMENT_PREVIEW";
  return "LOCAL_OR_UNKNOWN";
}

function deriveOverall(states: HealthState[]): HealthState {
  if (states.includes("UNAVAILABLE")) return "UNAVAILABLE";
  if (states.includes("DEGRADED")) return "DEGRADED";
  if (states.every((state) => state === "NOT_CONFIGURED")) return "NOT_CONFIGURED";
  return "HEALTHY";
}

export class PlatformSystemHealthService {
  async read(context: PlatformAuthorizationContext): Promise<PlatformSystemHealthSnapshot> {
    requirePlatformAuthorization(context, { permission: "platform.health.read" });
    const checkedAt = new Date().toISOString();
    let databaseConnectivity: HealthState = "HEALTHY";
    let latestMigration: MigrationRow | null = null;
    let failedMigrationCount = 0;
    let notification: NotificationHealthRow = { pending: BigInt(0), retry: BigInt(0), processing: BigInt(0), deadLetter: BigInt(0), staleProcessing: BigInt(0), oldestAvailableAt: null };
    let integration: IntegrationHealthRow = {
      activeConnections: BigInt(0),
      suspendedConnections: BigInt(0),
      retryDeliveries: BigInt(0),
      deadLetterDeliveries: BigInt(0),
      reconciliationRequired: BigInt(0),
      staleProcessing: BigInt(0),
      recentTwilioDeliveryFailures: BigInt(0),
      twilioStatusPollErrors: BigInt(0),
    };

    try {
      await db.$queryRaw<Array<{ ok: number }>>(Prisma.sql`SELECT 1 AS ok`);
      latestMigration = (await db.$queryRaw<MigrationRow[]>(Prisma.sql`SELECT migration_name,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 1`))[0] ?? null;
      failedMigrationCount = Number((await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL`))[0]?.count ?? BigInt(0));
      notification = (await db.$queryRaw<NotificationHealthRow[]>(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE status='PENDING')::bigint AS pending,
               COUNT(*) FILTER (WHERE status='RETRY')::bigint AS retry,
               COUNT(*) FILTER (WHERE status='PROCESSING')::bigint AS processing,
               COUNT(*) FILTER (WHERE status='DEAD_LETTER')::bigint AS "deadLetter",
               COUNT(*) FILTER (WHERE status='PROCESSING' AND "claimedAt" < CURRENT_TIMESTAMP - INTERVAL '5 minutes')::bigint AS "staleProcessing",
               MIN("availableAt") FILTER (WHERE status IN ('PENDING','RETRY')) AS "oldestAvailableAt"
        FROM "PlatformNotification"`))[0] ?? notification;
      integration = (await db.$queryRaw<IntegrationHealthRow[]>(Prisma.sql`
        SELECT
          (SELECT COUNT(*) FROM "PlatformIntegrationConnection" WHERE "status"='ACTIVE')::bigint AS "activeConnections",
          (SELECT COUNT(*) FROM "PlatformIntegrationConnection" WHERE "status"='SUSPENDED')::bigint AS "suspendedConnections",
          (SELECT COUNT(*) FROM "PlatformIntegrationDelivery" WHERE "status"='RETRY')::bigint AS "retryDeliveries",
          (SELECT COUNT(*) FROM "PlatformIntegrationDelivery" WHERE "status"='DEAD_LETTER')::bigint AS "deadLetterDeliveries",
          (SELECT COUNT(*) FROM "PlatformIntegrationDelivery" WHERE "status"='RECONCILIATION_REQUIRED')::bigint AS "reconciliationRequired",
          (SELECT COUNT(*) FROM "PlatformIntegrationDelivery" WHERE "status"='PROCESSING' AND "claimedAt" < CURRENT_TIMESTAMP - INTERVAL '5 minutes')::bigint AS "staleProcessing",
          (SELECT COUNT(*) FROM "PlatformIntegrationDelivery" d
             JOIN "PlatformIntegrationConnection" c ON c."id"=d."connectionId"
             WHERE c."adapterKey"='twilio.sms'
               AND d."providerOutcome" IN ('TWILIO_FAILED','TWILIO_UNDELIVERED','TWILIO_CANCELED')
               AND COALESCE(d."deliveredAt",d."createdAt") > CURRENT_TIMESTAMP - INTERVAL '24 hours')::bigint AS "recentTwilioDeliveryFailures",
          (SELECT COUNT(*) FROM "PlatformIntegrationDelivery" d
             JOIN "PlatformIntegrationConnection" c ON c."id"=d."connectionId"
             WHERE c."adapterKey"='twilio.sms'
               AND d."providerStatusError" IS NOT NULL
               AND d."providerStatusCheckedAt" > CURRENT_TIMESTAMP - INTERVAL '1 hour')::bigint AS "twilioStatusPollErrors"`))[0] ?? integration;
    } catch {
      databaseConnectivity = "UNAVAILABLE";
    }

    const notificationState: HealthState = databaseConnectivity === "UNAVAILABLE" ? "UNAVAILABLE" : Number(notification.deadLetter) > 0 || Number(notification.staleProcessing) > 0 ? "DEGRADED" : "HEALTHY";
    const migrationState: HealthState = databaseConnectivity === "UNAVAILABLE" ? "UNAVAILABLE" : failedMigrationCount > 0 ? "DEGRADED" : "HEALTHY";
    const scheduledStatus: HealthState = process.env.PLATFORM_SCHEDULER_CONFIGURED === "true" ? "HEALTHY" : "NOT_CONFIGURED";
    const integrationStatus: HealthState = databaseConnectivity === "UNAVAILABLE"
      ? "UNAVAILABLE"
      : Number(integration.activeConnections) === 0 && Number(integration.suspendedConnections) === 0
        ? "NOT_CONFIGURED"
        : Number(integration.deadLetterDeliveries) > 0
          || Number(integration.reconciliationRequired) > 0
          || Number(integration.staleProcessing) > 0
          || Number(integration.recentTwilioDeliveryFailures) > 0
          || Number(integration.twilioStatusPollErrors) > 0
            ? "DEGRADED"
            : "HEALTHY";

    return {
      checkedAt,
      overall: deriveOverall([databaseConnectivity, migrationState, notificationState, integrationStatus]),
      application: { readiness: databaseConnectivity === "UNAVAILABLE" ? "DEGRADED" : "HEALTHY", releaseIdentity: releaseIdentity(), environmentClass: environmentClass() },
      database: { connectivity: databaseConnectivity, latestMigration: latestMigration?.migration_name ?? null, latestMigrationFinishedAt: latestMigration?.finished_at?.toISOString() ?? null, failedMigrationCount },
      backgroundJobs: { notificationDelivery: notificationState, pending: Number(notification.pending), retry: Number(notification.retry), processing: Number(notification.processing), deadLetter: Number(notification.deadLetter), oldestAvailableAt: notification.oldestAvailableAt?.toISOString() ?? null, staleProcessing: Number(notification.staleProcessing) },
      scheduledTasks: { status: scheduledStatus, detail: scheduledStatus === "HEALTHY" ? "Platform scheduler is configured." : "No platform scheduler is declared in this release." },
      integrations: {
        status: integrationStatus,
        detail: integrationStatus === "NOT_CONFIGURED"
          ? "Integration framework is installed; no provider connection is configured."
          : `${Number(integration.activeConnections)} active connection(s), ${Number(integration.retryDeliveries)} retry delivery(s), ${Number(integration.reconciliationRequired)} reconciliation-required delivery(s), ${Number(integration.deadLetterDeliveries)} dead letter(s), ${Number(integration.recentTwilioDeliveryFailures)} Twilio downstream failure(s) in the last 24 hours, ${Number(integration.twilioStatusPollErrors)} Twilio status-poll error(s) in the last hour.`,
      },
    };
  }
}
