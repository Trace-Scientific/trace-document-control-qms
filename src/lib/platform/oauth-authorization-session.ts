import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { requirePlatformAuthorization, type PlatformAuthorizationContext } from "./authorization";
import type { PlatformCredentialStore } from "./credential-store";
import {
  PlatformIntegrationConfigurationError,
  PlatformIntegrationConflictError,
  PlatformIntegrationNotFoundError,
} from "./integration-framework";
import { PlatformOAuthProviderRegistry } from "./oauth-provider";

const SESSION_MINUTES = 10;
const PENDING_KEY = "_traceOAuthPendingAuthorization";

type JsonRecord = Record<string, unknown>;

type AuthorizationSessionRow = {
  id: string;
  connectionId: string;
  providerKey: string;
  credentialRef: string;
  expiresAt: Date;
  consumedAt: Date | null;
};

function parseCredential(value: string): JsonRecord {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new PlatformIntegrationConfigurationError("OAuth credential bundle is invalid JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PlatformIntegrationConfigurationError("OAuth credential bundle must be an object");
  }
  return parsed as JsonRecord;
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

async function audit(
  tx: Prisma.TransactionClient,
  context: PlatformAuthorizationContext,
  action: string,
  entityId: string,
  reason: string,
  metadata: Prisma.InputJsonObject,
) {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "PlatformAuditEvent" ("id","actorIdentityId","actorMembershipId","action","entityType","entityId","reason","metadata")
    VALUES (gen_random_uuid(),${context.platformIdentityId}::uuid,${context.platformMembershipId}::uuid,${action},'PlatformOAuthAuthorizationSession',${entityId}::uuid,${reason},${JSON.stringify(metadata)}::jsonb)
  `);
}

export class PlatformOAuthAuthorizationSessionService {
  constructor(
    private readonly providers = new PlatformOAuthProviderRegistry(),
    private readonly credentials: PlatformCredentialStore,
  ) {}

  async begin(context: PlatformAuthorizationContext, input: { connectionId: string; providerKey: string; reason: string }) {
    requirePlatformAuthorization(context, { permission: "platform.integration.manage" });
    const provider = this.providers.get(input.providerKey.trim());
    if (!provider) throw new PlatformIntegrationConfigurationError("OAuth provider is not registered in this release");
    const reason = input.reason.trim();
    if (!reason || reason.length > 1000) throw new PlatformIntegrationConfigurationError("Reason is required and must be 1000 characters or fewer");

    const connections = await db.$queryRaw<Array<{ id: string; adapterKey: string; credentialRef: string | null }>>(Prisma.sql`
      SELECT "id","adapterKey","credentialRef" FROM "PlatformIntegrationConnection" WHERE "id"=${input.connectionId}::uuid
    `);
    if (connections.length !== 1) throw new PlatformIntegrationNotFoundError("Integration connection not found");
    const connection = connections[0];
    if (connection.adapterKey !== provider.adapterKey) throw new PlatformIntegrationConflictError("OAuth provider does not match the integration adapter");
    if (!connection.credentialRef?.startsWith("aws-sm://")) {
      throw new PlatformIntegrationConfigurationError("OAuth authorization sessions require an AWS integration secret reference");
    }

    const existing = await this.credentials.resolve(connection.credentialRef);
    if (!existing) throw new PlatformIntegrationConfigurationError("OAuth credential bundle is unavailable");
    const credential = parseCredential(existing);
    const sessionId = randomUUID();
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(64).toString("base64url");
    const challenge = pkceChallenge(verifier);
    const expiresAt = new Date(Date.now() + SESSION_MINUTES * 60 * 1000);
    credential[PENDING_KEY] = { sessionId, codeVerifier: verifier, expiresAt: expiresAt.toISOString() };

    await this.credentials.replace(connection.credentialRef, JSON.stringify(credential));
    await db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "PlatformOAuthAuthorizationSession"
        SET "consumedAt"=COALESCE("consumedAt",CURRENT_TIMESTAMP)
        WHERE "connectionId"=${connection.id}::uuid AND "consumedAt" IS NULL
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PlatformOAuthAuthorizationSession" ("id","connectionId","providerKey","stateSha256","pkceChallenge","expiresAt")
        VALUES (${sessionId}::uuid,${connection.id}::uuid,${provider.key},${sha256Hex(state)},${challenge},${expiresAt})
      `);
      await audit(tx, context, "platform.integration.oauth.authorization_started", sessionId, reason, {
        connectionId: connection.id,
        providerKey: provider.key,
        expiresAt: expiresAt.toISOString(),
        pkceMethod: "S256",
      });
    });

    return { sessionId, state, codeChallenge: challenge, codeChallengeMethod: "S256" as const, expiresAt };
  }

  async consume(input: { state: string }) {
    const state = input.state.trim();
    if (!state || state.length > 512) throw new PlatformIntegrationConfigurationError("OAuth state is invalid");
    const stateHash = sha256Hex(state);
    const rows = await db.$queryRaw<AuthorizationSessionRow[]>(Prisma.sql`
      SELECT s."id",s."connectionId",s."providerKey",c."credentialRef",s."expiresAt",s."consumedAt"
      FROM "PlatformOAuthAuthorizationSession" s
      JOIN "PlatformIntegrationConnection" c ON c."id"=s."connectionId"
      WHERE s."stateSha256"=${stateHash} AND c."status"='ACTIVE'
    `);
    if (rows.length !== 1) throw new PlatformIntegrationNotFoundError("OAuth authorization session not found");
    const session = rows[0];
    if (session.consumedAt || session.expiresAt.getTime() <= Date.now()) {
      throw new PlatformIntegrationConflictError("OAuth authorization session is expired or already consumed");
    }

    const current = await this.credentials.resolve(session.credentialRef);
    if (!current) throw new PlatformIntegrationConfigurationError("OAuth credential bundle is unavailable");
    const credential = parseCredential(current);
    const pending = credential[PENDING_KEY];
    if (!pending || typeof pending !== "object" || Array.isArray(pending)) {
      throw new PlatformIntegrationConflictError("OAuth PKCE verifier is unavailable");
    }
    const pendingRecord = pending as JsonRecord;
    const pendingSessionId = typeof pendingRecord.sessionId === "string" ? pendingRecord.sessionId : "";
    const codeVerifier = typeof pendingRecord.codeVerifier === "string" ? pendingRecord.codeVerifier : "";
    const pendingExpiry = typeof pendingRecord.expiresAt === "string" ? Date.parse(pendingRecord.expiresAt) : Number.NaN;
    if (pendingSessionId !== session.id || !codeVerifier || !Number.isFinite(pendingExpiry) || pendingExpiry <= Date.now()) {
      throw new PlatformIntegrationConflictError("OAuth PKCE verifier does not match the authorization session");
    }

    delete credential[PENDING_KEY];
    const cleanedCredential = JSON.stringify(credential);
    await this.credentials.replace(session.credentialRef, cleanedCredential);
    const consumed = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "PlatformOAuthAuthorizationSession"
      SET "consumedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${session.id}::uuid AND "consumedAt" IS NULL AND "expiresAt">CURRENT_TIMESTAMP
      RETURNING "id"
    `);
    if (consumed.length !== 1) throw new PlatformIntegrationConflictError("OAuth authorization session could not be consumed");

    return {
      sessionId: session.id,
      connectionId: session.connectionId,
      providerKey: session.providerKey,
      credentialRef: session.credentialRef,
      credential: cleanedCredential,
      codeVerifier,
    };
  }
}
