import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import {
  requirePlatformAuthorization,
  type PlatformAuthorizationContext,
} from "./authorization";

export const SUPPORT_SESSION_COOKIE = "qms_support_session";
export const SUPPORT_CAPABILITIES = [
  "support.tenant.read",
  "support.tenant.troubleshoot",
  "support.tenant.safe_write",
] as const;
export type SupportCapabilityKey = (typeof SUPPORT_CAPABILITIES)[number];

export const CUSTOMER_ONLY_SUPPORT_ACTIONS = [
  "electronic_signature.create",
  "document.approve",
  "workflow.approve",
  "legal_hold.release",
  "security.role.manage",
  "security.membership.manage",
] as const;
export type CustomerOnlySupportAction = (typeof CUSTOMER_ONLY_SUPPORT_ACTIONS)[number];

export type SupportCaseStatus = "OPEN" | "CLOSED";
export type SupportAccessRequestStatus = "PENDING" | "APPROVED" | "DENIED" | "CANCELLED";
export type SupportSessionStatus = "ACTIVE" | "ENDED" | "REVOKED" | "EXPIRED";

export interface SupportCaseRecord {
  id: string;
  customerAccountId: string;
  targetOrganizationId: string;
  caseNumber: string;
  title: string;
  description: string | null;
  status: SupportCaseStatus;
  openedByMembershipId: string;
  openedAt: Date;
  closedAt: Date | null;
}

export interface SupportAccessRequestRecord {
  id: string;
  caseId: string;
  targetOrganizationId: string;
  requestedByMembershipId: string;
  reason: string;
  status: SupportAccessRequestStatus;
  requestedAt: Date;
  requestedExpiresAt: Date;
  capabilities: SupportCapabilityKey[];
}

export interface SupportSessionContext {
  supportSessionId: string;
  supportCaseId: string;
  platformIdentityId: string;
  platformMembershipId: string;
  targetOrganizationId: string;
  targetOrganizationName: string;
  expiresAt: Date;
  capabilities: SupportCapabilityKey[];
}

interface CaseRow extends SupportCaseRecord {}
interface RequestRow {
  id: string;
  caseId: string;
  targetOrganizationId: string;
  requestedByMembershipId: string;
  reason: string;
  status: SupportAccessRequestStatus;
  requestedAt: Date;
  requestedExpiresAt: Date;
}
interface SessionRow {
  id: string;
  requestId: string;
  caseId: string;
  actorIdentityId: string;
  actorMembershipId: string;
  targetOrganizationId: string;
  status: SupportSessionStatus;
  issuedAt: Date;
  expiresAt: Date;
  organizationName: string;
}

const MAX_SESSION_MS = 4 * 60 * 60 * 1000;
const MIN_SESSION_MS = 5 * 60 * 1000;

export class SupportAccessService {
  async listCases(context: PlatformAuthorizationContext): Promise<SupportCaseRecord[]> {
    requirePlatformAuthorization(context, { permission: "platform.support.request" });
    return db.$queryRaw<CaseRow[]>(Prisma.sql`
      SELECT "id", "customerAccountId", "targetOrganizationId", "caseNumber", "title",
             "description", "status"::text AS "status", "openedByMembershipId", "openedAt", "closedAt"
      FROM "SupportCase"
      ORDER BY "openedAt" DESC, "id"
    `);
  }

  async createCase(
    context: PlatformAuthorizationContext,
    input: {
      customerAccountId: string;
      caseNumber: string;
      title: string;
      description?: string | null;
      reason: string;
    },
  ): Promise<SupportCaseRecord> {
    requirePlatformAuthorization(context, { permission: "platform.support.request" });
    validateText(input.caseNumber, "Case number", 120);
    validateText(input.title, "Title", 300);
    validateReason(input.reason);

    return db.$transaction(async (tx) => {
      const targets = await tx.$queryRaw<Array<{ organizationId: string | null; status: string }>>(Prisma.sql`
        SELECT "organizationId", "status"::text AS "status"
        FROM "CustomerAccount"
        WHERE "id" = ${input.customerAccountId}::uuid
        FOR SHARE
      `);
      const target = targets[0];
      if (!target?.organizationId) {
        throw new SupportAccessValidationError("Customer account must be linked to a tenant organization");
      }
      if (target.status === "TERMINATED") {
        throw new SupportAccessValidationError("Terminated customer accounts cannot receive new support cases");
      }

      const rows = await tx.$queryRaw<CaseRow[]>(Prisma.sql`
        INSERT INTO "SupportCase" (
          "id", "customerAccountId", "targetOrganizationId", "caseNumber", "title",
          "description", "openedByMembershipId"
        ) VALUES (
          gen_random_uuid(), ${input.customerAccountId}::uuid, ${target.organizationId}::uuid,
          ${input.caseNumber.trim()}, ${input.title.trim()}, ${input.description?.trim() || null},
          ${context.platformMembershipId}::uuid
        )
        RETURNING "id", "customerAccountId", "targetOrganizationId", "caseNumber", "title",
                  "description", "status"::text AS "status", "openedByMembershipId", "openedAt", "closedAt"
      `);
      const row = rows[0];
      await writePlatformAudit(tx, context, "support_case.created", "SupportCase", row.id, input.reason, {
        customerAccountId: row.customerAccountId,
        targetOrganizationId: row.targetOrganizationId,
        caseNumber: row.caseNumber,
      });
      return row;
    });
  }

  async closeCase(
    context: PlatformAuthorizationContext,
    input: { caseId: string; reason: string },
  ): Promise<void> {
    requirePlatformAuthorization(context, { permission: "platform.support.request" });
    validateReason(input.reason);
    await db.$transaction(async (tx) => {
      const openSessions = await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "count" FROM "SupportSession"
        WHERE "caseId" = ${input.caseId}::uuid AND "status" = 'ACTIVE' AND "expiresAt" > CURRENT_TIMESTAMP
      `);
      if ((openSessions[0]?.count ?? 0n) > 0n) {
        throw new SupportAccessConflictError("Support case cannot close while an active support session exists");
      }
      const changed = await tx.$executeRaw(Prisma.sql`
        UPDATE "SupportCase"
        SET "status" = 'CLOSED', "closedByMembershipId" = ${context.platformMembershipId}::uuid,
            "closedAt" = CURRENT_TIMESTAMP, "closeReason" = ${input.reason.trim()}
        WHERE "id" = ${input.caseId}::uuid AND "status" = 'OPEN'
      `);
      if (changed !== 1) throw new SupportAccessNotFoundError("Open support case not found");
      await writePlatformAudit(tx, context, "support_case.closed", "SupportCase", input.caseId, input.reason, {});
    });
  }

  async listRequests(context: PlatformAuthorizationContext): Promise<SupportAccessRequestRecord[]> {
    requirePlatformAuthorization(context, { permission: "platform.support.request" });
    const rows = await db.$queryRaw<RequestRow[]>(Prisma.sql`
      SELECT "id", "caseId", "targetOrganizationId", "requestedByMembershipId", "reason",
             "status"::text AS "status", "requestedAt", "requestedExpiresAt"
      FROM "SupportAccessRequest"
      ORDER BY "requestedAt" DESC, "id"
    `);
    return Promise.all(rows.map((row) => this.hydrateRequest(row)));
  }

  async requestAccess(
    context: PlatformAuthorizationContext,
    input: {
      caseId: string;
      reason: string;
      durationMinutes: number;
      capabilities: SupportCapabilityKey[];
    },
  ): Promise<SupportAccessRequestRecord> {
    requirePlatformAuthorization(context, { permission: "platform.support.request" });
    validateReason(input.reason);
    validateDuration(input.durationMinutes);
    validateCapabilities(input.capabilities);

    const expiresAt = new Date(Date.now() + input.durationMinutes * 60_000);
    const row = await db.$transaction(async (tx) => {
      const cases = await tx.$queryRaw<Array<{ id: string; targetOrganizationId: string }>>(Prisma.sql`
        SELECT "id", "targetOrganizationId" FROM "SupportCase"
        WHERE "id" = ${input.caseId}::uuid AND "status" = 'OPEN'
        FOR SHARE
      `);
      const supportCase = cases[0];
      if (!supportCase) throw new SupportAccessNotFoundError("Open support case not found");

      const rows = await tx.$queryRaw<RequestRow[]>(Prisma.sql`
        INSERT INTO "SupportAccessRequest" (
          "id", "caseId", "targetOrganizationId", "requestedByMembershipId", "reason", "requestedExpiresAt"
        ) VALUES (
          gen_random_uuid(), ${supportCase.id}::uuid, ${supportCase.targetOrganizationId}::uuid,
          ${context.platformMembershipId}::uuid, ${input.reason.trim()}, ${expiresAt}
        )
        RETURNING "id", "caseId", "targetOrganizationId", "requestedByMembershipId", "reason",
                  "status"::text AS "status", "requestedAt", "requestedExpiresAt"
      `);
      const request = rows[0];
      for (const capability of [...new Set(input.capabilities)]) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "SupportAccessRequestCapability" ("requestId", "capabilityKey")
          VALUES (${request.id}::uuid, ${capability})
        `);
      }
      await writePlatformAudit(tx, context, "support_access.requested", "SupportAccessRequest", request.id, input.reason, {
        caseId: request.caseId,
        targetOrganizationId: request.targetOrganizationId,
        requestedExpiresAt: request.requestedExpiresAt.toISOString(),
        capabilities: input.capabilities,
      });
      return request;
    });
    return { ...row, capabilities: [...new Set(input.capabilities)] };
  }

  async decideRequest(
    context: PlatformAuthorizationContext,
    input: { requestId: string; decision: "APPROVED" | "DENIED"; reason: string },
  ): Promise<void> {
    requirePlatformAuthorization(context, { permission: "platform.support.approve" });
    validateReason(input.reason);
    await db.$transaction(async (tx) => {
      const requests = await tx.$queryRaw<RequestRow[]>(Prisma.sql`
        SELECT "id", "caseId", "targetOrganizationId", "requestedByMembershipId", "reason",
               "status"::text AS "status", "requestedAt", "requestedExpiresAt"
        FROM "SupportAccessRequest"
        WHERE "id" = ${input.requestId}::uuid
        FOR UPDATE
      `);
      const request = requests[0];
      if (!request) throw new SupportAccessNotFoundError("Support access request not found");
      if (request.status !== "PENDING") throw new SupportAccessConflictError("Support access request is no longer pending");
      if (request.requestedByMembershipId === context.platformMembershipId) {
        throw new SupportAccessConflictError("Support access requests require approval by a different platform member");
      }
      if (request.requestedExpiresAt.getTime() <= Date.now()) {
        throw new SupportAccessConflictError("Support access request has expired");
      }

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "SupportAccessApproval" (
          "id", "requestId", "decidedByMembershipId", "decision", "decisionReason"
        ) VALUES (
          gen_random_uuid(), ${request.id}::uuid, ${context.platformMembershipId}::uuid,
          ${input.decision}::"SupportAccessDecision", ${input.reason.trim()}
        )
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "SupportAccessRequest"
        SET "status" = ${input.decision === "APPROVED" ? "APPROVED" : "DENIED"}::"SupportAccessRequestStatus"
        WHERE "id" = ${request.id}::uuid
      `);
      await writePlatformAudit(
        tx,
        context,
        input.decision === "APPROVED" ? "support_access.approved" : "support_access.denied",
        "SupportAccessRequest",
        request.id,
        input.reason,
        { caseId: request.caseId, targetOrganizationId: request.targetOrganizationId },
      );
    });
  }

  async issueAndAssumeSession(
    context: PlatformAuthorizationContext,
    input: { requestId: string; reason: string },
  ): Promise<{ token: string; session: SupportSessionContext }> {
    requirePlatformAuthorization(context, { permission: "platform.support.access" });
    validateReason(input.reason);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashSupportToken(token);

    const result = await db.$transaction(async (tx) => {
      const requests = await tx.$queryRaw<RequestRow[]>(Prisma.sql`
        SELECT "id", "caseId", "targetOrganizationId", "requestedByMembershipId", "reason",
               "status"::text AS "status", "requestedAt", "requestedExpiresAt"
        FROM "SupportAccessRequest"
        WHERE "id" = ${input.requestId}::uuid
        FOR UPDATE
      `);
      const request = requests[0];
      if (!request) throw new SupportAccessNotFoundError("Support access request not found");
      if (request.status !== "APPROVED") throw new SupportAccessConflictError("Support access request is not approved");
      if (request.requestedByMembershipId !== context.platformMembershipId) {
        throw new SupportAccessConflictError("Only the approved requester may issue the support session");
      }
      if (request.requestedExpiresAt.getTime() <= Date.now()) {
        throw new SupportAccessConflictError("Approved support access request has expired");
      }
      const cases = await tx.$queryRaw<Array<{ status: SupportCaseStatus }>>(Prisma.sql`
        SELECT "status"::text AS "status" FROM "SupportCase" WHERE "id" = ${request.caseId}::uuid FOR SHARE
      `);
      if (cases[0]?.status !== "OPEN") throw new SupportAccessConflictError("Support case is closed");

      const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "SupportSession" WHERE "requestId" = ${request.id}::uuid
      `);
      if (existing.length > 0) throw new SupportAccessConflictError("Support session has already been issued");

      const rows = await tx.$queryRaw<SessionRow[]>(Prisma.sql`
        INSERT INTO "SupportSession" (
          "id", "requestId", "caseId", "actorIdentityId", "actorMembershipId",
          "targetOrganizationId", "tokenHash", "expiresAt"
        )
        SELECT gen_random_uuid(), ${request.id}::uuid, ${request.caseId}::uuid,
               ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid,
               ${request.targetOrganizationId}::uuid, ${tokenHash}, ${request.requestedExpiresAt}
        FROM "Organization" o
        WHERE o."id" = ${request.targetOrganizationId}::uuid
        RETURNING "id", "requestId", "caseId", "actorIdentityId", "actorMembershipId",
                  "targetOrganizationId", "status"::text AS "status", "issuedAt", "expiresAt",
                  (SELECT "displayName" FROM "Organization" WHERE "id" = ${request.targetOrganizationId}::uuid) AS "organizationName"
      `);
      const session = rows[0];
      if (!session) throw new SupportAccessNotFoundError("Target organization not found");

      const capabilities = await tx.$queryRaw<Array<{ capabilityKey: SupportCapabilityKey }>>(Prisma.sql`
        SELECT "capabilityKey" FROM "SupportAccessRequestCapability" WHERE "requestId" = ${request.id}::uuid
      `);
      for (const capability of capabilities) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "SupportSessionCapability" ("sessionId", "capabilityKey")
          VALUES (${session.id}::uuid, ${capability.capabilityKey})
        `);
      }
      await appendSessionEvent(tx, session.id, context.platformMembershipId, "ISSUED", input.reason, {});
      await appendSessionEvent(tx, session.id, context.platformMembershipId, "ASSUMED", input.reason, {});
      await writePlatformAudit(tx, context, "support_session.assumed", "SupportSession", session.id, input.reason, {
        caseId: session.caseId,
        targetOrganizationId: session.targetOrganizationId,
        expiresAt: session.expiresAt.toISOString(),
        capabilities: capabilities.map((item) => item.capabilityKey),
      });
      return {
        supportSessionId: session.id,
        supportCaseId: session.caseId,
        platformIdentityId: session.actorIdentityId,
        platformMembershipId: session.actorMembershipId,
        targetOrganizationId: session.targetOrganizationId,
        targetOrganizationName: session.organizationName,
        expiresAt: session.expiresAt,
        capabilities: capabilities.map((item) => item.capabilityKey),
      } satisfies SupportSessionContext;
    });

    return { token, session: result };
  }

  async authenticateSession(
    context: PlatformAuthorizationContext,
    rawToken: string | undefined,
  ): Promise<SupportSessionContext> {
    requirePlatformAuthorization(context, { permission: "platform.support.access" });
    if (!rawToken) throw new SupportSessionRequiredError();
    const tokenHash = hashSupportToken(rawToken);

    return db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<SessionRow[]>(Prisma.sql`
        SELECT s."id", s."requestId", s."caseId", s."actorIdentityId", s."actorMembershipId",
               s."targetOrganizationId", s."status"::text AS "status", s."issuedAt", s."expiresAt",
               o."displayName" AS "organizationName"
        FROM "SupportSession" s
        INNER JOIN "Organization" o ON o."id" = s."targetOrganizationId"
        WHERE s."tokenHash" = ${tokenHash}
        FOR UPDATE OF s
      `);
      const session = rows[0];
      if (!session || session.actorMembershipId !== context.platformMembershipId || session.actorIdentityId !== context.platformIdentityId) {
        throw new SupportSessionRequiredError();
      }
      if (session.status !== "ACTIVE") throw new SupportSessionRequiredError();
      if (session.expiresAt.getTime() <= Date.now()) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "SupportSession" SET "status" = 'EXPIRED', "endedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${session.id}::uuid AND "status" = 'ACTIVE'
        `);
        await appendSessionEvent(tx, session.id, context.platformMembershipId, "EXPIRED", "Session expired", {});
        await writePlatformAudit(tx, context, "support_session.expired", "SupportSession", session.id, "Session expired", {
          targetOrganizationId: session.targetOrganizationId,
        });
        throw new SupportSessionRequiredError();
      }
      const capabilities = await tx.$queryRaw<Array<{ capabilityKey: SupportCapabilityKey }>>(Prisma.sql`
        SELECT "capabilityKey" FROM "SupportSessionCapability" WHERE "sessionId" = ${session.id}::uuid ORDER BY "capabilityKey"
      `);
      return {
        supportSessionId: session.id,
        supportCaseId: session.caseId,
        platformIdentityId: session.actorIdentityId,
        platformMembershipId: session.actorMembershipId,
        targetOrganizationId: session.targetOrganizationId,
        targetOrganizationName: session.organizationName,
        expiresAt: session.expiresAt,
        capabilities: capabilities.map((item) => item.capabilityKey),
      };
    });
  }

  async exitSession(
    context: PlatformAuthorizationContext,
    rawToken: string | undefined,
    reason: string,
  ): Promise<void> {
    validateReason(reason);
    const session = await this.authenticateSession(context, rawToken);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "SupportSession" SET "status" = 'ENDED', "endedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${session.supportSessionId}::uuid AND "status" = 'ACTIVE'
      `);
      await appendSessionEvent(tx, session.supportSessionId, context.platformMembershipId, "EXITED", reason, {});
      await writePlatformAudit(tx, context, "support_session.exited", "SupportSession", session.supportSessionId, reason, {
        targetOrganizationId: session.targetOrganizationId,
      });
    });
  }

  async revokeSession(
    context: PlatformAuthorizationContext,
    input: { sessionId: string; reason: string },
  ): Promise<void> {
    requirePlatformAuthorization(context, { permission: "platform.support.approve" });
    validateReason(input.reason);
    await db.$transaction(async (tx) => {
      const changed = await tx.$executeRaw(Prisma.sql`
        UPDATE "SupportSession"
        SET "status" = 'REVOKED', "revokedAt" = CURRENT_TIMESTAMP, "endedAt" = CURRENT_TIMESTAMP,
            "revokedByMembershipId" = ${context.platformMembershipId}::uuid,
            "revocationReason" = ${input.reason.trim()}
        WHERE "id" = ${input.sessionId}::uuid AND "status" = 'ACTIVE'
      `);
      if (changed !== 1) throw new SupportAccessNotFoundError("Active support session not found");
      await appendSessionEvent(tx, input.sessionId, context.platformMembershipId, "REVOKED", input.reason, {});
      await writePlatformAudit(tx, context, "support_session.revoked", "SupportSession", input.sessionId, input.reason, {});
    });
  }

  private async hydrateRequest(row: RequestRow): Promise<SupportAccessRequestRecord> {
    const capabilities = await db.$queryRaw<Array<{ capabilityKey: SupportCapabilityKey }>>(Prisma.sql`
      SELECT "capabilityKey" FROM "SupportAccessRequestCapability" WHERE "requestId" = ${row.id}::uuid ORDER BY "capabilityKey"
    `);
    return { ...row, capabilities: capabilities.map((item) => item.capabilityKey) };
  }
}

export function requireSupportCapability(context: SupportSessionContext, capability: SupportCapabilityKey): void {
  if (!context.capabilities.includes(capability)) throw new SupportCapabilityDeniedError(capability);
}

export function requireSupportTargetOrganization(
  context: SupportSessionContext,
  organizationId: string,
): void {
  if (context.targetOrganizationId !== organizationId) {
    throw new SupportTargetOrganizationDeniedError();
  }
}

export function requireSupportActionAllowed(action: string): void {
  if ((CUSTOMER_ONLY_SUPPORT_ACTIONS as readonly string[]).includes(action)) {
    throw new SupportCustomerOnlyActionError(action);
  }
}

export async function writeSupportLinkedTenantAudit(
  tx: Prisma.TransactionClient,
  context: SupportSessionContext,
  event: {
    action: string;
    entityType: string;
    entityId?: string | null;
    entityVersion?: string | null;
    reason: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  requireSupportCapability(context, "support.tenant.safe_write");
  requireSupportActionAllowed(event.action);
  validateReason(event.reason);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "AuditEvent" (
      "id", "organizationId", "actorUserId", "action", "entityType", "entityId",
      "entityVersion", "correlationId", "reason", "metadata"
    ) VALUES (
      gen_random_uuid(), ${context.targetOrganizationId}::uuid, NULL, ${event.action}, ${event.entityType},
      ${event.entityId ?? null}::uuid, ${event.entityVersion ?? null}, ${context.supportSessionId}::uuid,
      ${event.reason.trim()}, ${JSON.stringify({
        ...(event.metadata ?? {}),
        supportSessionId: context.supportSessionId,
        supportCaseId: context.supportCaseId,
        platformIdentityId: context.platformIdentityId,
        platformMembershipId: context.platformMembershipId,
        supportActor: true,
      })}::jsonb
    )
  `);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "PlatformAuditEvent" (
      "id", "actorIdentityId", "actorMembershipId", "action", "entityType", "entityId",
      "correlationId", "reason", "metadata"
    ) VALUES (
      gen_random_uuid(), ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid,
      ${`tenant_support.${event.action}`}, ${event.entityType}, ${event.entityId ?? null}::uuid,
      ${context.supportSessionId}::uuid, ${event.reason.trim()},
      ${JSON.stringify({
        ...(event.metadata ?? {}),
        targetOrganizationId: context.targetOrganizationId,
        supportSessionId: context.supportSessionId,
        supportCaseId: context.supportCaseId,
      })}::jsonb
    )
  `);
}

export function hashSupportToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function appendSessionEvent(
  tx: Prisma.TransactionClient,
  sessionId: string,
  actorMembershipId: string,
  eventType: "ISSUED" | "ASSUMED" | "EXITED" | "REVOKED" | "EXPIRED",
  reason: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "SupportSessionEvent" (
      "id", "sessionId", "eventType", "actorMembershipId", "reason", "metadata"
    ) VALUES (
      gen_random_uuid(), ${sessionId}::uuid, ${eventType}::"SupportSessionEventType",
      ${actorMembershipId}::uuid, ${reason.trim()}, ${JSON.stringify(metadata)}::jsonb
    )
  `);
}

async function writePlatformAudit(
  tx: Prisma.TransactionClient,
  context: PlatformAuthorizationContext,
  action: string,
  entityType: string,
  entityId: string,
  reason: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "PlatformAuditEvent" (
      "id", "actorIdentityId", "actorMembershipId", "action", "entityType", "entityId", "reason", "metadata"
    ) VALUES (
      gen_random_uuid(), ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid,
      ${action}, ${entityType}, ${entityId}::uuid, ${reason.trim()}, ${JSON.stringify(metadata)}::jsonb
    )
  `);
}

function validateDuration(minutes: number): void {
  const durationMs = minutes * 60_000;
  if (!Number.isInteger(minutes) || durationMs < MIN_SESSION_MS || durationMs > MAX_SESSION_MS) {
    throw new SupportAccessValidationError("Support access duration must be between 5 and 240 minutes");
  }
}

function validateCapabilities(capabilities: SupportCapabilityKey[]): void {
  if (capabilities.length === 0) throw new SupportAccessValidationError("At least one support capability is required");
  for (const capability of capabilities) {
    if (!(SUPPORT_CAPABILITIES as readonly string[]).includes(capability)) {
      throw new SupportAccessValidationError("Unknown support capability");
    }
  }
}

function validateReason(reason: string): void {
  if (!reason.trim() || reason.length > 1000) {
    throw new SupportAccessValidationError("A reason between 1 and 1000 characters is required");
  }
}

function validateText(value: string, label: string, max: number): void {
  if (!value.trim() || value.length > max) {
    throw new SupportAccessValidationError(`${label} is required and must be ${max} characters or fewer`);
  }
}

export class SupportAccessValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupportAccessValidationError";
  }
}
export class SupportAccessConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupportAccessConflictError";
  }
}
export class SupportAccessNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupportAccessNotFoundError";
  }
}
export class SupportSessionRequiredError extends Error {
  constructor() {
    super("Active controlled support session required");
    this.name = "SupportSessionRequiredError";
  }
}
export class SupportCapabilityDeniedError extends Error {
  constructor(capability: string) {
    super(`Support capability denied: ${capability}`);
    this.name = "SupportCapabilityDeniedError";
  }
}
export class SupportTargetOrganizationDeniedError extends Error {
  constructor() {
    super("Support session is not authorized for the requested tenant organization");
    this.name = "SupportTargetOrganizationDeniedError";
  }
}
export class SupportCustomerOnlyActionError extends Error {
  constructor(action: string) {
    super(`Support access cannot perform customer-only action: ${action}`);
    this.name = "SupportCustomerOnlyActionError";
  }
}
