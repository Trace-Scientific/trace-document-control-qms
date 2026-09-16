import { Prisma } from "@prisma/client";
import { db } from "../db";
import type { PlatformAuthorizationContext } from "./authorization";
import { requirePlatformAuthorization } from "./authorization";

export type HealthState = "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "NOT_CONFIGURED";

export interface PlatformSystemHealthSnapshot {
  checkedAt: string;
  overall: HealthState;
  application: {
    readiness: HealthState;
    releaseIdentity: string | null;
    environmentClass: "DEVELOPMENT_PREVIEW" | "PROTECTED_VALIDATION" | "PRODUCTION" | "LOCAL_OR_UNKNOWN";
  };
  database: {
    connectivity: HealthState;
    latestMigration: string | null;
    latestMigrationFinishedAt: string | null;
    failedMigrationCount: number;
  };
  backgroundJobs: {
    notificationDelivery: HealthState;
    pending: number;
    retry: number;
    processing: number;
    deadLetter: number;
    oldestAvailableAt: string | null;
    staleProcessing: number;
  };
  scheduledTasks: {
    status: HealthState;
    detail: string;
  };
  integrations: {
    status: HealthState;
    detail: string;
  };
}

interface MigrationRow {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
}

interface NotificationHealthRow {
  pending: bigint;
  retry: bigint;
  processing: bigint;
  deadLetter: bigint;
  staleProcessing: bigint;
  oldestAvailableAt: Date | null;
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
    let notification: NotificationHealthRow = {
      pending: BigInt(0), retry: BigInt(0), processing: BigInt(0), deadLetter: BigInt(0), staleProcessing: BigInt(0), oldestAvailableAt: null,
    };

    try {
      await db.$queryRaw<Array<{ ok: number }>>(Prisma.sql`SELECT 1 AS ok`);
      const migrations = await db.$queryRaw<MigrationRow[]>(Prisma.sql`
        SELECT migration_name, finished_at, rolled_back_at
        FROM "_prisma_migrations"
        ORDER BY started_at DESC
        LIMIT 1
      `);
      latestMigration = migrations[0] ?? null;
      const failures = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "_prisma_migrations"
        WHERE finished_at IS NULL AND rolled_back_at IS NULL
      `);
      failedMigrationCount = Number(failures[0]?.count ?? BigInt(0));
      const rows = await db.$queryRaw<NotificationHealthRow[]>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE status='PENDING')::bigint AS pending,
          COUNT(*) FILTER (WHERE status='RETRY')::bigint AS retry,
          COUNT(*) FILTER (WHERE status='PROCESSING')::bigint AS processing,
          COUNT(*) FILTER (WHERE status='DEAD_LETTER')::bigint AS "deadLetter",
          COUNT(*) FILTER (WHERE status='PROCESSING' AND "claimedAt" < CURRENT_TIMESTAMP - INTERVAL '5 minutes')::bigint AS "staleProcessing",
          MIN("availableAt") FILTER (WHERE status IN ('PENDING','RETRY')) AS "oldestAvailableAt"
        FROM "PlatformNotification"
      `);
      notification = rows[0] ?? notification;
    } catch {
      databaseConnectivity = "UNAVAILABLE";
    }

    const notificationState: HealthState = databaseConnectivity === "UNAVAILABLE"
      ? "UNAVAILABLE"
      : Number(notification.deadLetter) > 0 || Number(notification.staleProcessing) > 0
        ? "DEGRADED"
        : "HEALTHY";

    const migrationState: HealthState = databaseConnectivity === "UNAVAILABLE"
      ? "UNAVAILABLE"
      : failedMigrationCount > 0 ? "DEGRADED" : "HEALTHY";

    const scheduledStatus: HealthState = process.env.PLATFORM_SCHEDULER_CONFIGURED === "true" ? "HEALTHY" : "NOT_CONFIGURED";
    const integrationStatus: HealthState = "NOT_CONFIGURED";

    return {
      checkedAt,
      overall: deriveOverall([databaseConnectivity, migrationState, notificationState]),
      application: {
        readiness: databaseConnectivity === "UNAVAILABLE" ? "DEGRADED" : "HEALTHY",
        releaseIdentity: releaseIdentity(),
        environmentClass: environmentClass(),
      },
      database: {
        connectivity: databaseConnectivity,
        latestMigration: latestMigration?.migration_name ?? null,
        latestMigrationFinishedAt: latestMigration?.finished_at?.toISOString() ?? null,
        failedMigrationCount,
      },
      backgroundJobs: {
        notificationDelivery: notificationState,
        pending: Number(notification.pending),
        retry: Number(notification.retry),
        processing: Number(notification.processing),
        deadLetter: Number(notification.deadLetter),
        oldestAvailableAt: notification.oldestAvailableAt?.toISOString() ?? null,
        staleProcessing: Number(notification.staleProcessing),
      },
      scheduledTasks: {
        status: scheduledStatus,
        detail: scheduledStatus === "HEALTHY" ? "Platform scheduler is configured." : "No platform scheduler is declared in this release.",
      },
      integrations: {
        status: integrationStatus,
        detail: "Platform integration framework is not implemented until PR 10.",
      },
    };
  }
}
