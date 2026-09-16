import { Prisma } from "@prisma/client";
import { db } from "../db";
import { requirePlatformAuthorization, type PlatformAuthorizationContext } from "./authorization";
import { PlatformIntegrationConfigurationError, PlatformIntegrationConflictError, PlatformIntegrationNotFoundError } from "./integration-framework";
import type { PlatformCredentialStore } from "./credential-store";
import { PlatformOAuthProviderRegistry, PlatformOAuthReauthorizationRequiredError } from "./oauth-provider";

export type PlatformOAuthLifecycleStatus = "ACTIVE" | "REFRESHING" | "REVOKING" | "REAUTH_REQUIRED" | "REVOKED" | "ERROR";

export type PlatformOAuthLifecycleRecord = {
  id: string;
  connectionId: string;
  providerKey: string;
  status: PlatformOAuthLifecycleStatus;
  scopes: unknown;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  nextRefreshAt: Date | null;
  lastRefreshAt: Date | null;
  lastRevokedAt: Date | null;
  lastFailureAt: Date | null;
  lastFailureCode: string | null;
  claimedAt: Date | null;
  claimedBy: string | null;
  lockVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

type ClaimedOAuthLifecycle = {
  id: string;
  connectionId: string;
  providerKey: string;
  adapterKey: string;
  credentialRef: string;
  scopes: unknown;
};

const CLAIM_TIMEOUT_MINUTES = 5;
const RETRY_MINUTES = 5;

function text(value: string, label: string, max = 1000) {
  const normalized = value.trim();
  if (!normalized) throw new PlatformIntegrationConfigurationError(`${label} is required`);
  if (normalized.length > max) throw new PlatformIntegrationConfigurationError(`${label} is too long`);
  return normalized;
}

function normalizeScopes(values: readonly string[] = []) {
  if (values.length > 50) throw new PlatformIntegrationConfigurationError("OAuth scope list is too large");
  return [...new Set(values.map((value) => text(value, "OAuth scope", 200)))].sort();
}

function dateOrNull(value: Date | null | undefined, label: string) {
  if (value == null) return null;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new PlatformIntegrationConfigurationError(`${label} is invalid`);
  return value;
}

function failureCode(error: unknown) {
  if (error instanceof PlatformOAuthReauthorizationRequiredError) return "REAUTHORIZATION_REQUIRED";
  if (error instanceof PlatformIntegrationConfigurationError) return "CONFIGURATION_ERROR";
  return "PROVIDER_REQUEST_FAILED";
}

async function audit(
  tx: Prisma.TransactionClient,
  context: PlatformAuthorizationContext,
  action: string,
  entityId: string,
  reason: string,
  metadata: Prisma.InputJsonObject = {},
) {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "PlatformAuditEvent" ("id","actorIdentityId","actorMembershipId","action","entityType","entityId","reason","metadata")
    VALUES (gen_random_uuid(),${context.platformIdentityId}::uuid,${context.platformMembershipId}::uuid,${action},'PlatformOAuthCredentialLifecycle',${entityId}::uuid,${reason},${JSON.stringify(metadata)}::jsonb)
  `);
}

export class PlatformOAuthLifecycleService {
  constructor(
    private readonly providers = new PlatformOAuthProviderRegistry(),
    private readonly credentials: PlatformCredentialStore,
  ) {}

  async get(context: PlatformAuthorizationContext, connectionId: string) {
    requirePlatformAuthorization(context, { permission: "platform.integration.manage" });
    const rows = await db.$queryRaw<PlatformOAuthLifecycleRecord[]>(Prisma.sql`
      SELECT "id","connectionId","providerKey","status"::text AS "status","scopes","accessTokenExpiresAt","refreshTokenExpiresAt","nextRefreshAt","lastRefreshAt","lastRevokedAt","lastFailureAt","lastFailureCode","claimedAt","claimedBy","lockVersion","createdAt","updatedAt"
      FROM "PlatformOAuthCredentialLifecycle" WHERE "connectionId"=${connectionId}::uuid
    `);
    return rows[0] ?? null;
  }

  async register(context: PlatformAuthorizationContext, input: {
    connectionId: string;
    providerKey: string;
    scopes?: readonly string[];
    accessTokenExpiresAt?: Date | null;
    refreshTokenExpiresAt?: Date | null;
    nextRefreshAt?: Date | null;
    reason: string;
  }) {
    requirePlatformAuthorization(context, { permission: "platform.integration.manage" });
    const providerKey = text(input.providerKey, "OAuth provider key", 160);
    const reason = text(input.reason, "Reason");
    const provider = this.providers.get(providerKey);
    if (!provider) throw new PlatformIntegrationConfigurationError("OAuth provider is not registered in this release");
    const scopes = normalizeScopes(input.scopes);
    const accessTokenExpiresAt = dateOrNull(input.accessTokenExpiresAt, "Access-token expiry");
    const refreshTokenExpiresAt = dateOrNull(input.refreshTokenExpiresAt, "Refresh-token expiry");
    const nextRefreshAt = dateOrNull(input.nextRefreshAt, "Next refresh time");

    const connections = await db.$queryRaw<Array<{ id: string; adapterKey: string; credentialRef: string | null }>>(Prisma.sql`
      SELECT "id","adapterKey","credentialRef" FROM "PlatformIntegrationConnection" WHERE "id"=${input.connectionId}::uuid
    `);
    if (connections.length !== 1) throw new PlatformIntegrationNotFoundError("Integration connection not found");
    const connection = connections[0];
    if (connection.adapterKey !== provider.adapterKey) throw new PlatformIntegrationConflictError("OAuth provider does not match the integration adapter");
    if (!connection.credentialRef?.startsWith("aws-sm://")) {
      throw new PlatformIntegrationConfigurationError("Managed OAuth lifecycle requires an AWS integration secret reference");
    }
    await this.credentials.resolve(connection.credentialRef);

    return db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<PlatformOAuthLifecycleRecord[]>(Prisma.sql`
        INSERT INTO "PlatformOAuthCredentialLifecycle" ("connectionId","providerKey","status","scopes","accessTokenExpiresAt","refreshTokenExpiresAt","nextRefreshAt")
        VALUES (${connection.id}::uuid,${providerKey},'ACTIVE',${JSON.stringify(scopes)}::jsonb,${accessTokenExpiresAt},${refreshTokenExpiresAt},${nextRefreshAt})
        ON CONFLICT ("connectionId") DO UPDATE SET
          "providerKey"=EXCLUDED."providerKey",
          "status"='ACTIVE',
          "scopes"=EXCLUDED."scopes",
          "accessTokenExpiresAt"=EXCLUDED."accessTokenExpiresAt",
          "refreshTokenExpiresAt"=EXCLUDED."refreshTokenExpiresAt",
          "nextRefreshAt"=EXCLUDED."nextRefreshAt",
          "lastFailureAt"=NULL,
          "lastFailureCode"=NULL,
          "claimedAt"=NULL,
          "claimedBy"=NULL,
          "lockVersion"="PlatformOAuthCredentialLifecycle"."lockVersion"+1,
          "updatedAt"=CURRENT_TIMESTAMP
        RETURNING "id","connectionId","providerKey","status"::text AS "status","scopes","accessTokenExpiresAt","refreshTokenExpiresAt","nextRefreshAt","lastRefreshAt","lastRevokedAt","lastFailureAt","lastFailureCode","claimedAt","claimedBy","lockVersion","createdAt","updatedAt"
      `);
      await audit(tx, context, "platform.integration.oauth.registered", rows[0].id, reason, { connectionId: connection.id, providerKey, scopes });
      return rows[0];
    });
  }

  async claimDue(workerId: string, limit = 10): Promise<ClaimedOAuthLifecycle[]> {
    const worker = text(workerId, "OAuth worker id", 160);
    const bounded = Math.max(1, Math.min(50, Math.trunc(limit)));
    return db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "PlatformOAuthCredentialLifecycle"
        SET "status"='ERROR',"claimedAt"=NULL,"claimedBy"=NULL,"lastFailureAt"=CURRENT_TIMESTAMP,"lastFailureCode"='CLAIM_TIMEOUT',"nextRefreshAt"=CURRENT_TIMESTAMP + INTERVAL '${Prisma.raw(String(RETRY_MINUTES))} minutes',"updatedAt"=CURRENT_TIMESTAMP
        WHERE "status" IN ('REFRESHING','REVOKING') AND "claimedAt" < CURRENT_TIMESTAMP - INTERVAL '${Prisma.raw(String(CLAIM_TIMEOUT_MINUTES))} minutes'
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "PlatformOAuthCredentialLifecycle"
        SET "status"='REAUTH_REQUIRED',"nextRefreshAt"=NULL,"lastFailureAt"=CURRENT_TIMESTAMP,"lastFailureCode"='REFRESH_TOKEN_EXPIRED',"updatedAt"=CURRENT_TIMESTAMP
        WHERE "status" IN ('ACTIVE','ERROR') AND "refreshTokenExpiresAt" IS NOT NULL AND "refreshTokenExpiresAt" <= CURRENT_TIMESTAMP
      `);
      return tx.$queryRaw<ClaimedOAuthLifecycle[]>(Prisma.sql`
        WITH candidates AS (
          SELECT o."id"
          FROM "PlatformOAuthCredentialLifecycle" o
          JOIN "PlatformIntegrationConnection" c ON c."id"=o."connectionId"
          WHERE o."status" IN ('ACTIVE','ERROR')
            AND o."nextRefreshAt" IS NOT NULL
            AND o."nextRefreshAt" <= CURRENT_TIMESTAMP
            AND (o."refreshTokenExpiresAt" IS NULL OR o."refreshTokenExpiresAt" > CURRENT_TIMESTAMP)
            AND c."status"='ACTIVE'
            AND c."credentialRef" LIKE 'aws-sm://%'
          ORDER BY o."nextRefreshAt",o."updatedAt"
          FOR UPDATE SKIP LOCKED LIMIT ${bounded}
        )
        UPDATE "PlatformOAuthCredentialLifecycle" o
        SET "status"='REFRESHING',"claimedAt"=CURRENT_TIMESTAMP,"claimedBy"=${worker},"lockVersion"="lockVersion"+1,"updatedAt"=CURRENT_TIMESTAMP
        FROM candidates x, "PlatformIntegrationConnection" c
        WHERE o."id"=x."id" AND c."id"=o."connectionId"
        RETURNING o."id",o."connectionId",o."providerKey",c."adapterKey",c."credentialRef",o."scopes"
      `);
    });
  }

  async refreshClaimed(claim: ClaimedOAuthLifecycle, workerId: string) {
    const worker = text(workerId, "OAuth worker id", 160);
    const provider = this.providers.get(claim.providerKey);
    if (!provider || provider.adapterKey !== claim.adapterKey) {
      return this.failClaim(claim.id, worker, new PlatformIntegrationConfigurationError("OAuth provider registration does not match the integration adapter"));
    }
    try {
      const credential = await this.credentials.resolve(claim.credentialRef);
      if (!credential) throw new PlatformIntegrationConfigurationError("OAuth credential bundle is unavailable");
      const refreshed = await provider.refresh(credential);
      await this.credentials.replace(claim.credentialRef, refreshed.credential);
      const scopes = refreshed.scopes ? normalizeScopes(refreshed.scopes) : claim.scopes;
      const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "PlatformOAuthCredentialLifecycle"
        SET "status"='ACTIVE',"scopes"=${JSON.stringify(scopes)}::jsonb,"accessTokenExpiresAt"=${refreshed.accessTokenExpiresAt ?? null},"refreshTokenExpiresAt"=${refreshed.refreshTokenExpiresAt ?? null},"nextRefreshAt"=${refreshed.nextRefreshAt ?? null},"lastRefreshAt"=CURRENT_TIMESTAMP,"lastFailureAt"=NULL,"lastFailureCode"=NULL,"claimedAt"=NULL,"claimedBy"=NULL,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${claim.id}::uuid AND "status"='REFRESHING' AND "claimedBy"=${worker}
        RETURNING "id"
      `);
      if (rows.length !== 1) throw new PlatformIntegrationConflictError("OAuth refresh claim is no longer owned by this worker");
      return "REFRESHED" as const;
    } catch (error) {
      return this.failClaim(claim.id, worker, error);
    }
  }

  private async failClaim(id: string, workerId: string, error: unknown) {
    const reauth = error instanceof PlatformOAuthReauthorizationRequiredError;
    const code = failureCode(error);
    await db.$executeRaw(Prisma.sql`
      UPDATE "PlatformOAuthCredentialLifecycle"
      SET "status"=${reauth ? "REAUTH_REQUIRED" : "ERROR"}::"PlatformOAuthLifecycleStatus",
          "nextRefreshAt"=${reauth ? null : new Date(Date.now() + RETRY_MINUTES * 60 * 1000)},
          "lastFailureAt"=CURRENT_TIMESTAMP,
          "lastFailureCode"=${code},
          "claimedAt"=NULL,
          "claimedBy"=NULL,
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "claimedBy"=${workerId} AND "status"='REFRESHING'
    `);
    return reauth ? "REAUTH_REQUIRED" as const : "ERROR" as const;
  }

  async refreshNow(context: PlatformAuthorizationContext, input: { connectionId: string; reason: string }) {
    requirePlatformAuthorization(context, { permission: "platform.integration.manage" });
    const reason = text(input.reason, "Reason");
    const workerId = `platform-admin:${context.platformMembershipId}`.slice(0, 160);
    const claims = await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ClaimedOAuthLifecycle[]>(Prisma.sql`
        UPDATE "PlatformOAuthCredentialLifecycle" o
        SET "status"='REFRESHING',"claimedAt"=CURRENT_TIMESTAMP,"claimedBy"=${workerId},"lockVersion"="lockVersion"+1,"updatedAt"=CURRENT_TIMESTAMP
        FROM "PlatformIntegrationConnection" c
        WHERE o."connectionId"=${input.connectionId}::uuid
          AND c."id"=o."connectionId"
          AND o."status" IN ('ACTIVE','ERROR','REAUTH_REQUIRED')
          AND c."credentialRef" LIKE 'aws-sm://%'
        RETURNING o."id",o."connectionId",o."providerKey",c."adapterKey",c."credentialRef",o."scopes"
      `);
      if (rows.length !== 1) throw new PlatformIntegrationConflictError("OAuth lifecycle cannot be refreshed in its current state");
      await audit(tx, context, "platform.integration.oauth.refresh_requested", rows[0].id, reason, { connectionId: input.connectionId });
      return rows;
    });
    return this.refreshClaimed(claims[0], workerId);
  }

  async revoke(context: PlatformAuthorizationContext, input: { connectionId: string; reason: string }) {
    requirePlatformAuthorization(context, { permission: "platform.integration.manage" });
    const reason = text(input.reason, "Reason");
    const workerId = `platform-admin:${context.platformMembershipId}`.slice(0, 160);
    const claim = await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ClaimedOAuthLifecycle[]>(Prisma.sql`
        UPDATE "PlatformOAuthCredentialLifecycle" o
        SET "status"='REVOKING',"claimedAt"=CURRENT_TIMESTAMP,"claimedBy"=${workerId},"lockVersion"="lockVersion"+1,"updatedAt"=CURRENT_TIMESTAMP
        FROM "PlatformIntegrationConnection" c
        WHERE o."connectionId"=${input.connectionId}::uuid
          AND c."id"=o."connectionId"
          AND o."status" NOT IN ('REFRESHING','REVOKING','REVOKED')
          AND c."credentialRef" LIKE 'aws-sm://%'
        RETURNING o."id",o."connectionId",o."providerKey",c."adapterKey",c."credentialRef",o."scopes"
      `);
      if (rows.length !== 1) throw new PlatformIntegrationConflictError("OAuth lifecycle cannot be revoked in its current state");
      await audit(tx, context, "platform.integration.oauth.revoke_requested", rows[0].id, reason, { connectionId: input.connectionId });
      return rows[0];
    });

    const provider = this.providers.get(claim.providerKey);
    if (!provider || provider.adapterKey !== claim.adapterKey) throw new PlatformIntegrationConfigurationError("OAuth provider registration does not match the integration adapter");
    try {
      const credential = await this.credentials.resolve(claim.credentialRef);
      if (!credential) throw new PlatformIntegrationConfigurationError("OAuth credential bundle is unavailable");
      const revoked = await provider.revoke(credential);
      await this.credentials.replace(claim.credentialRef, revoked.credential);
      await db.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "PlatformOAuthCredentialLifecycle"
          SET "status"='REVOKED',"accessTokenExpiresAt"=NULL,"refreshTokenExpiresAt"=NULL,"nextRefreshAt"=NULL,"lastRevokedAt"=CURRENT_TIMESTAMP,"lastFailureAt"=NULL,"lastFailureCode"=NULL,"claimedAt"=NULL,"claimedBy"=NULL,"updatedAt"=CURRENT_TIMESTAMP
          WHERE "id"=${claim.id}::uuid AND "status"='REVOKING' AND "claimedBy"=${workerId}
        `);
        await tx.$executeRaw(Prisma.sql`
          UPDATE "PlatformIntegrationConnection"
          SET "status"='SUSPENDED',"lockVersion"="lockVersion"+1,"updatedAt"=CURRENT_TIMESTAMP
          WHERE "id"=${input.connectionId}::uuid AND "status"='ACTIVE'
        `);
        await audit(tx, context, "platform.integration.oauth.revoked", claim.id, reason, { connectionId: input.connectionId, providerKey: claim.providerKey });
      });
      return "REVOKED" as const;
    } catch (error) {
      const code = failureCode(error);
      await db.$executeRaw(Prisma.sql`
        UPDATE "PlatformOAuthCredentialLifecycle"
        SET "status"='ERROR',"lastFailureAt"=CURRENT_TIMESTAMP,"lastFailureCode"=${code},"claimedAt"=NULL,"claimedBy"=NULL,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${claim.id}::uuid AND "status"='REVOKING' AND "claimedBy"=${workerId}
      `);
      throw error;
    }
  }
}
