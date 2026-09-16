import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { requirePlatformAuthorization, type PlatformAuthorizationContext } from "./authorization";

export type PlatformIntegrationConnectionStatus = "DRAFT" | "ACTIVE" | "SUSPENDED" | "REVOKED";
export type PlatformIntegrationDeliveryStatus = "PENDING" | "PROCESSING" | "RETRY" | "SUCCEEDED" | "DEAD_LETTER";

export interface PlatformIntegrationConnectionRecord {
  id: string;
  adapterKey: string;
  displayName: string;
  status: PlatformIntegrationConnectionStatus;
  credentialRef: string | null;
  configuration: unknown;
  lockVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface NormalizedInboundEvent {
  eventType: string;
  providerEventId?: string | null;
  payload: Prisma.InputJsonObject;
}

export interface PlatformIntegrationAdapter {
  readonly key: string;
  deliver(input: { eventType: string; payload: unknown; configuration: unknown; credential: string | null }): Promise<void>;
  verifyAndNormalizeWebhook(input: { rawBody: string; headers: Headers; configuration: unknown; credential: string | null }): Promise<NormalizedInboundEvent>;
}

export interface PlatformCredentialResolver {
  resolve(reference: string | null): Promise<string | null>;
}

export class UnavailableCredentialResolver implements PlatformCredentialResolver {
  async resolve(reference: string | null) {
    if (reference) throw new PlatformIntegrationConfigurationError("Credential resolver is not configured");
    return null;
  }
}

export class PlatformIntegrationConfigurationError extends Error {}
export class PlatformIntegrationConflictError extends Error {}
export class PlatformIntegrationNotFoundError extends Error {}

const MAX_ATTEMPTS = 5;
const RETRY_SECONDS = [60, 300, 900, 3600, 14400] as const;

function requireText(value: string, label: string, max = 1000) {
  const normalized = value.trim();
  if (!normalized) throw new PlatformIntegrationConfigurationError(`${label} is required`);
  if (normalized.length > max) throw new PlatformIntegrationConfigurationError(`${label} is too long`);
  return normalized;
}

async function audit(tx: Prisma.TransactionClient, context: PlatformAuthorizationContext, action: string, entityType: string, entityId: string, reason: string, metadata: Prisma.InputJsonObject = {}) {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "PlatformAuditEvent" ("id","actorIdentityId","actorMembershipId","action","entityType","entityId","reason","metadata")
    VALUES (gen_random_uuid(),${context.platformIdentityId}::uuid,${context.platformMembershipId}::uuid,${action},${entityType},${entityId}::uuid,${reason},${JSON.stringify(metadata)}::jsonb)
  `);
}

export class PlatformIntegrationRegistry {
  constructor(private readonly adapters: readonly PlatformIntegrationAdapter[] = []) {}
  get(key: string) { return this.adapters.find((adapter) => adapter.key === key) ?? null; }
  listKeys() { return this.adapters.map((adapter) => adapter.key).sort(); }
}

export class PlatformIntegrationService {
  constructor(
    private readonly registry = new PlatformIntegrationRegistry(),
    private readonly credentials: PlatformCredentialResolver = new UnavailableCredentialResolver(),
  ) {}

  async listConnections(context: PlatformAuthorizationContext): Promise<PlatformIntegrationConnectionRecord[]> {
    requirePlatformAuthorization(context, { permission: "platform.integration.manage" });
    return db.$queryRaw<PlatformIntegrationConnectionRecord[]>(Prisma.sql`
      SELECT "id","adapterKey","displayName","status"::text AS "status","credentialRef","configuration","lockVersion","createdAt","updatedAt"
      FROM "PlatformIntegrationConnection" ORDER BY "createdAt" DESC
    `);
  }

  async createConnection(context: PlatformAuthorizationContext, input: { adapterKey: string; displayName: string; credentialRef?: string | null; configuration?: Prisma.InputJsonObject; reason: string }) {
    requirePlatformAuthorization(context, { permission: "platform.integration.manage" });
    const adapterKey = requireText(input.adapterKey, "Adapter key", 160);
    const displayName = requireText(input.displayName, "Display name", 240);
    const reason = requireText(input.reason, "Reason");
    const credentialRef = input.credentialRef?.trim() || null;
    return db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<PlatformIntegrationConnectionRecord[]>(Prisma.sql`
        INSERT INTO "PlatformIntegrationConnection" ("adapterKey","displayName","credentialRef","configuration","createdByIdentityId","createdByMembershipId")
        VALUES (${adapterKey},${displayName},${credentialRef},${JSON.stringify(input.configuration ?? {})}::jsonb,${context.platformIdentityId}::uuid,${context.platformMembershipId}::uuid)
        RETURNING "id","adapterKey","displayName","status"::text AS "status","credentialRef","configuration","lockVersion","createdAt","updatedAt"
      `);
      await audit(tx, context, "platform.integration.connection.created", "PlatformIntegrationConnection", rows[0].id, reason, { adapterKey });
      return rows[0];
    });
  }

  async transitionConnection(context: PlatformAuthorizationContext, input: { connectionId: string; toStatus: PlatformIntegrationConnectionStatus; expectedLockVersion: number; reason: string }) {
    requirePlatformAuthorization(context, { permission: "platform.integration.manage" });
    const reason = requireText(input.reason, "Reason");
    const allowed: Record<PlatformIntegrationConnectionStatus, readonly PlatformIntegrationConnectionStatus[]> = {
      DRAFT: ["ACTIVE", "REVOKED"], ACTIVE: ["SUSPENDED", "REVOKED"], SUSPENDED: ["ACTIVE", "REVOKED"], REVOKED: [],
    };
    return db.$transaction(async (tx) => {
      const current = await tx.$queryRaw<Array<{ status: PlatformIntegrationConnectionStatus }>>(Prisma.sql`SELECT "status"::text AS "status" FROM "PlatformIntegrationConnection" WHERE "id"=${input.connectionId}::uuid FOR UPDATE`);
      if (current.length !== 1) throw new PlatformIntegrationNotFoundError("Integration connection not found");
      if (!allowed[current[0].status].includes(input.toStatus)) throw new PlatformIntegrationConflictError("Invalid integration connection transition");
      if (input.toStatus === "ACTIVE" && !this.registry.get((await tx.$queryRaw<Array<{ adapterKey: string }>>(Prisma.sql`SELECT "adapterKey" FROM "PlatformIntegrationConnection" WHERE "id"=${input.connectionId}::uuid`))[0].adapterKey)) {
        throw new PlatformIntegrationConfigurationError("Adapter is not registered in this release");
      }
      const rows = await tx.$queryRaw<PlatformIntegrationConnectionRecord[]>(Prisma.sql`
        UPDATE "PlatformIntegrationConnection" SET "status"=${input.toStatus}::"PlatformIntegrationConnectionStatus","lockVersion"="lockVersion"+1,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${input.connectionId}::uuid AND "lockVersion"=${input.expectedLockVersion}
        RETURNING "id","adapterKey","displayName","status"::text AS "status","credentialRef","configuration","lockVersion","createdAt","updatedAt"
      `);
      if (rows.length !== 1) throw new PlatformIntegrationConflictError("Integration connection changed; refresh and retry");
      await audit(tx, context, "platform.integration.connection.transitioned", "PlatformIntegrationConnection", input.connectionId, reason, { fromStatus: current[0].status, toStatus: input.toStatus });
      return rows[0];
    });
  }

  async enqueueOutbound(context: PlatformAuthorizationContext, input: { connectionId: string; eventType: string; payload: Prisma.InputJsonObject; idempotencyKey: string; correlationId?: string | null; reason: string }) {
    requirePlatformAuthorization(context, { permission: "platform.integration.manage" });
    const eventType = requireText(input.eventType, "Event type", 200);
    const idempotencyKey = requireText(input.idempotencyKey, "Idempotency key", 240);
    const reason = requireText(input.reason, "Reason");
    return db.$transaction(async (tx) => {
      const active = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "PlatformIntegrationConnection" WHERE "id"=${input.connectionId}::uuid AND "status"='ACTIVE'`);
      if (active.length !== 1) throw new PlatformIntegrationConflictError("Integration connection must be active");
      const rows = await tx.$queryRaw<Array<{ id: string; status: PlatformIntegrationDeliveryStatus }>>(Prisma.sql`
        INSERT INTO "PlatformIntegrationDelivery" ("connectionId","eventType","payload","idempotencyKey","correlationId")
        VALUES (${input.connectionId}::uuid,${eventType},${JSON.stringify(input.payload)}::jsonb,${idempotencyKey},${input.correlationId ?? null}::uuid)
        RETURNING "id","status"::text AS "status"
      `);
      await audit(tx, context, "platform.integration.delivery.enqueued", "PlatformIntegrationDelivery", rows[0].id, reason, { connectionId: input.connectionId, eventType });
      return rows[0];
    });
  }

  async claimOutbound(workerId: string, limit = 25) {
    const worker = requireText(workerId, "Worker id", 160);
    const bounded = Math.max(1, Math.min(100, Math.trunc(limit)));
    return db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`UPDATE "PlatformIntegrationDelivery" SET "status"='RETRY',"claimedAt"=NULL,"claimedBy"=NULL,"availableAt"=CURRENT_TIMESTAMP WHERE "status"='PROCESSING' AND "claimedAt" < CURRENT_TIMESTAMP - INTERVAL '5 minutes'`);
      return tx.$queryRaw<Array<{ id: string; connectionId: string; adapterKey: string; eventType: string; payload: unknown; configuration: unknown; credentialRef: string | null; attemptCount: number }>>(Prisma.sql`
        WITH candidates AS (
          SELECT d."id" FROM "PlatformIntegrationDelivery" d JOIN "PlatformIntegrationConnection" c ON c."id"=d."connectionId"
          WHERE d."status" IN ('PENDING','RETRY') AND d."availableAt"<=CURRENT_TIMESTAMP AND d."attemptCount"<${MAX_ATTEMPTS} AND c."status"='ACTIVE'
          ORDER BY d."availableAt",d."createdAt" FOR UPDATE SKIP LOCKED LIMIT ${bounded}
        )
        UPDATE "PlatformIntegrationDelivery" d SET "status"='PROCESSING',"claimedAt"=CURRENT_TIMESTAMP,"claimedBy"=${worker}
        FROM candidates x, "PlatformIntegrationConnection" c
        WHERE d."id"=x."id" AND c."id"=d."connectionId"
        RETURNING d."id",d."connectionId",c."adapterKey",d."eventType",d."payload",c."configuration",c."credentialRef",d."attemptCount"
      `);
    });
  }

  async deliverClaimed(claim: { id: string; adapterKey: string; eventType: string; payload: unknown; configuration: unknown; credentialRef: string | null }, workerId: string) {
    const adapter = this.registry.get(claim.adapterKey);
    if (!adapter) return this.failDelivery(claim.id, workerId, "Adapter is not registered in this release");
    try {
      const credential = await this.credentials.resolve(claim.credentialRef);
      await adapter.deliver({ eventType: claim.eventType, payload: claim.payload, configuration: claim.configuration, credential });
      await db.$executeRaw(Prisma.sql`UPDATE "PlatformIntegrationDelivery" SET "status"='SUCCEEDED',"attemptCount"="attemptCount"+1,"deliveredAt"=CURRENT_TIMESTAMP,"lastAttemptAt"=CURRENT_TIMESTAMP,"claimedAt"=NULL,"claimedBy"=NULL,"lastError"=NULL WHERE "id"=${claim.id}::uuid AND "status"='PROCESSING' AND "claimedBy"=${workerId}`);
      return "SUCCEEDED" as const;
    } catch (error) {
      return this.failDelivery(claim.id, workerId, error instanceof Error ? error.message : "Integration delivery failed");
    }
  }

  private async failDelivery(id: string, workerId: string, error: string) {
    const rows = await db.$queryRaw<Array<{ attemptCount: number }>>(Prisma.sql`SELECT "attemptCount" FROM "PlatformIntegrationDelivery" WHERE "id"=${id}::uuid AND "status"='PROCESSING' AND "claimedBy"=${workerId}`);
    if (rows.length !== 1) throw new PlatformIntegrationConflictError("Delivery is not claimed by this worker");
    const attempts = rows[0].attemptCount + 1;
    const dead = attempts >= MAX_ATTEMPTS;
    const delay = RETRY_SECONDS[Math.min(attempts - 1, RETRY_SECONDS.length - 1)];
    await db.$executeRaw(Prisma.sql`UPDATE "PlatformIntegrationDelivery" SET "status"=${dead ? "DEAD_LETTER" : "RETRY"}::"PlatformIntegrationDeliveryStatus","attemptCount"=${attempts},"availableAt"=${new Date(Date.now() + delay * 1000)},"lastAttemptAt"=CURRENT_TIMESTAMP,"claimedAt"=NULL,"claimedBy"=NULL,"lastError"=${error.slice(0,1000)},"deadLetteredAt"=${dead ? new Date() : null} WHERE "id"=${id}::uuid`);
    return dead ? "DEAD_LETTER" as const : "RETRY" as const;
  }

  async receiveWebhook(input: { connectionId: string; rawBody: string; headers: Headers; idempotencyKey: string; correlationId?: string | null }) {
    const idempotencyKey = requireText(input.idempotencyKey, "Idempotency key", 240);
    const connections = await db.$queryRaw<Array<{ id: string; adapterKey: string; configuration: unknown; credentialRef: string | null }>>(Prisma.sql`SELECT "id","adapterKey","configuration","credentialRef" FROM "PlatformIntegrationConnection" WHERE "id"=${input.connectionId}::uuid AND "status"='ACTIVE'`);
    if (connections.length !== 1) throw new PlatformIntegrationNotFoundError("Active integration connection not found");
    const connection = connections[0];
    const adapter = this.registry.get(connection.adapterKey);
    if (!adapter) throw new PlatformIntegrationConfigurationError("Adapter is not registered in this release");
    const rawBodySha256 = createHash("sha256").update(input.rawBody).digest("hex");
    const credential = await this.credentials.resolve(connection.credentialRef);
    const normalized = await adapter.verifyAndNormalizeWebhook({ rawBody: input.rawBody, headers: input.headers, configuration: connection.configuration, credential });
    return db.$transaction(async (tx) => {
      const receipts = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "PlatformInboundWebhookReceipt" ("connectionId","idempotencyKey","providerEventId","rawBodySha256","status","correlationId","verifiedAt","normalizedAt")
        VALUES (${connection.id}::uuid,${idempotencyKey},${normalized.providerEventId ?? null},${rawBodySha256},'NORMALIZED',${input.correlationId ?? null}::uuid,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT ("connectionId","idempotencyKey") DO NOTHING RETURNING "id"
      `);
      if (receipts.length === 0) return { duplicate: true };
      await tx.$executeRaw(Prisma.sql`INSERT INTO "PlatformIntegrationNormalizedEvent" ("receiptId","connectionId","eventType","payload","correlationId") VALUES (${receipts[0].id}::uuid,${connection.id}::uuid,${normalized.eventType},${JSON.stringify(normalized.payload)}::jsonb,${input.correlationId ?? null}::uuid)`);
      return { duplicate: false, receiptId: receipts[0].id };
    });
  }
}
