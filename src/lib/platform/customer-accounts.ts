import { Prisma } from "@prisma/client";
import { db } from "../db";
import {
  requirePlatformAuthorization,
  type PlatformAuthorizationContext,
} from "./authorization";

export const CUSTOMER_ACCOUNT_STATUSES = [
  "PROSPECT",
  "ONBOARDING",
  "ACTIVE",
  "SUSPENDED",
  "TERMINATED",
] as const;

export type CustomerAccountStatus = (typeof CUSTOMER_ACCOUNT_STATUSES)[number];

export interface CustomerAccount {
  id: string;
  organizationId: string | null;
  accountCode: string;
  legalName: string;
  displayName: string;
  status: CustomerAccountStatus;
  commercialMetadata: Record<string, unknown>;
  lockVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCustomerAccountInput {
  accountCode: string;
  legalName: string;
  displayName: string;
  organizationId?: string | null;
  commercialMetadata?: Record<string, unknown>;
  reason: string;
}

export interface UpdateCustomerAccountInput {
  customerAccountId: string;
  accountCode?: string;
  legalName?: string;
  displayName?: string;
  organizationId?: string | null;
  commercialMetadata?: Record<string, unknown>;
  expectedLockVersion: number;
  reason: string;
}

export interface TransitionCustomerAccountInput {
  customerAccountId: string;
  toStatus: CustomerAccountStatus;
  expectedLockVersion: number;
  reason: string;
}

interface CustomerAccountRow {
  id: string;
  organizationId: string | null;
  accountCode: string;
  legalName: string;
  displayName: string;
  status: CustomerAccountStatus;
  commercialMetadata: unknown;
  lockVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const TRANSITIONS: Readonly<Record<CustomerAccountStatus, readonly CustomerAccountStatus[]>> = {
  PROSPECT: ["ONBOARDING", "TERMINATED"],
  ONBOARDING: ["ACTIVE", "SUSPENDED", "TERMINATED"],
  ACTIVE: ["SUSPENDED", "TERMINATED"],
  SUSPENDED: ["ACTIVE", "TERMINATED"],
  TERMINATED: [],
};

export class CustomerAccountService {
  async list(context: PlatformAuthorizationContext): Promise<CustomerAccount[]> {
    requirePlatformAuthorization(context, { permission: "platform.organization.read" });
    const rows = await db.$queryRaw<CustomerAccountRow[]>(Prisma.sql`
      SELECT
        "id", "organizationId", "accountCode", "legalName", "displayName",
        "status"::text AS "status", "commercialMetadata", "lockVersion", "createdAt", "updatedAt"
      FROM "CustomerAccount"
      ORDER BY "displayName", "id"
    `);
    return rows.map(mapRow);
  }

  async get(context: PlatformAuthorizationContext, customerAccountId: string): Promise<CustomerAccount> {
    requirePlatformAuthorization(context, { permission: "platform.organization.read" });
    const rows = await db.$queryRaw<CustomerAccountRow[]>(Prisma.sql`
      SELECT
        "id", "organizationId", "accountCode", "legalName", "displayName",
        "status"::text AS "status", "commercialMetadata", "lockVersion", "createdAt", "updatedAt"
      FROM "CustomerAccount"
      WHERE "id" = ${customerAccountId}::uuid
      LIMIT 1
    `);
    if (rows.length !== 1) throw new CustomerAccountNotFoundError();
    return mapRow(rows[0]);
  }

  async create(
    context: PlatformAuthorizationContext,
    input: CreateCustomerAccountInput,
  ): Promise<CustomerAccount> {
    requirePlatformAuthorization(context, { permission: "platform.organization.manage" });
    validateReason(input.reason);
    validateText(input.accountCode, "Account code", 120);
    validateText(input.legalName, "Legal name", 300);
    validateText(input.displayName, "Display name", 300);

    const created = await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<CustomerAccountRow[]>(Prisma.sql`
        INSERT INTO "CustomerAccount" (
          "id", "organizationId", "accountCode", "legalName", "displayName",
          "status", "commercialMetadata", "updatedAt"
        ) VALUES (
          gen_random_uuid(), ${input.organizationId ?? null}::uuid, ${input.accountCode.trim()},
          ${input.legalName.trim()}, ${input.displayName.trim()}, 'PROSPECT',
          ${JSON.stringify(input.commercialMetadata ?? {})}::jsonb, CURRENT_TIMESTAMP
        )
        RETURNING
          "id", "organizationId", "accountCode", "legalName", "displayName",
          "status"::text AS "status", "commercialMetadata", "lockVersion", "createdAt", "updatedAt"
      `);
      const row = rows[0];

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "CustomerAccountStatusEvent" (
          "id", "customerAccountId", "fromStatus", "toStatus", "actorIdentityId",
          "actorMembershipId", "reason"
        ) VALUES (
          gen_random_uuid(), ${row.id}::uuid, NULL, 'PROSPECT', ${context.platformIdentityId}::uuid,
          ${context.platformMembershipId}::uuid, ${input.reason.trim()}
        )
      `);
      await writePlatformAudit(tx, context, {
        action: "customer_account.created",
        entityId: row.id,
        entityVersion: String(row.lockVersion),
        reason: input.reason,
        metadata: { accountCode: row.accountCode, organizationId: row.organizationId, status: "PROSPECT" },
      });
      return row;
    });

    return mapRow(created);
  }

  async update(
    context: PlatformAuthorizationContext,
    input: UpdateCustomerAccountInput,
  ): Promise<CustomerAccount> {
    requirePlatformAuthorization(context, { permission: "platform.organization.manage" });
    validateReason(input.reason);
    if (input.accountCode !== undefined) validateText(input.accountCode, "Account code", 120);
    if (input.legalName !== undefined) validateText(input.legalName, "Legal name", 300);
    if (input.displayName !== undefined) validateText(input.displayName, "Display name", 300);

    const updated = await db.$transaction(async (tx) => {
      const existing = await lockAccount(tx, input.customerAccountId);
      if (existing.lockVersion !== input.expectedLockVersion) throw new CustomerAccountConflictError();
      if (existing.status === "TERMINATED") throw new CustomerAccountValidationError("Terminated customer accounts cannot be edited");

      const nextAccountCode = input.accountCode?.trim() ?? existing.accountCode;
      const nextLegalName = input.legalName?.trim() ?? existing.legalName;
      const nextDisplayName = input.displayName?.trim() ?? existing.displayName;
      const nextOrganizationId = input.organizationId === undefined ? existing.organizationId : input.organizationId;
      const nextMetadata = input.commercialMetadata === undefined
        ? asMetadata(existing.commercialMetadata)
        : input.commercialMetadata;

      const rows = await tx.$queryRaw<CustomerAccountRow[]>(Prisma.sql`
        UPDATE "CustomerAccount"
        SET
          "organizationId" = ${nextOrganizationId}::uuid,
          "accountCode" = ${nextAccountCode},
          "legalName" = ${nextLegalName},
          "displayName" = ${nextDisplayName},
          "commercialMetadata" = ${JSON.stringify(nextMetadata)}::jsonb,
          "lockVersion" = "lockVersion" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${existing.id}::uuid AND "lockVersion" = ${input.expectedLockVersion}
        RETURNING
          "id", "organizationId", "accountCode", "legalName", "displayName",
          "status"::text AS "status", "commercialMetadata", "lockVersion", "createdAt", "updatedAt"
      `);
      if (rows.length !== 1) throw new CustomerAccountConflictError();

      await writePlatformAudit(tx, context, {
        action: "customer_account.updated",
        entityId: existing.id,
        entityVersion: String(rows[0].lockVersion),
        reason: input.reason,
        metadata: {
          previousLockVersion: existing.lockVersion,
          organizationId: rows[0].organizationId,
          accountCode: rows[0].accountCode,
        },
      });
      return rows[0];
    });

    return mapRow(updated);
  }

  async transitionStatus(
    context: PlatformAuthorizationContext,
    input: TransitionCustomerAccountInput,
  ): Promise<CustomerAccount> {
    validateReason(input.reason);

    const updated = await db.$transaction(async (tx) => {
      const existing = await lockAccount(tx, input.customerAccountId);
      requireTransitionAuthorization(context, existing.status, input.toStatus);
      if (existing.lockVersion !== input.expectedLockVersion) throw new CustomerAccountConflictError();
      if (!TRANSITIONS[existing.status].includes(input.toStatus)) {
        throw new CustomerAccountTransitionError(existing.status, input.toStatus);
      }

      const rows = await tx.$queryRaw<CustomerAccountRow[]>(Prisma.sql`
        UPDATE "CustomerAccount"
        SET "status" = ${input.toStatus}::"CustomerAccountStatus",
            "lockVersion" = "lockVersion" + 1,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${existing.id}::uuid AND "lockVersion" = ${input.expectedLockVersion}
        RETURNING
          "id", "organizationId", "accountCode", "legalName", "displayName",
          "status"::text AS "status", "commercialMetadata", "lockVersion", "createdAt", "updatedAt"
      `);
      if (rows.length !== 1) throw new CustomerAccountConflictError();

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "CustomerAccountStatusEvent" (
          "id", "customerAccountId", "fromStatus", "toStatus", "actorIdentityId",
          "actorMembershipId", "reason"
        ) VALUES (
          gen_random_uuid(), ${existing.id}::uuid, ${existing.status}::"CustomerAccountStatus",
          ${input.toStatus}::"CustomerAccountStatus", ${context.platformIdentityId}::uuid,
          ${context.platformMembershipId}::uuid, ${input.reason.trim()}
        )
      `);
      await writePlatformAudit(tx, context, {
        action: "customer_account.status_changed",
        entityId: existing.id,
        entityVersion: String(rows[0].lockVersion),
        reason: input.reason,
        metadata: { fromStatus: existing.status, toStatus: input.toStatus },
      });
      return rows[0];
    });

    return mapRow(updated);
  }
}

function requireTransitionAuthorization(
  context: PlatformAuthorizationContext,
  fromStatus: CustomerAccountStatus,
  toStatus: CustomerAccountStatus,
): void {
  const sensitive = toStatus === "SUSPENDED" || toStatus === "TERMINATED" || fromStatus === "SUSPENDED";
  requirePlatformAuthorization(context, {
    permission: sensitive ? "platform.organization.suspend" : "platform.organization.manage",
  });
}

async function lockAccount(
  tx: Prisma.TransactionClient,
  customerAccountId: string,
): Promise<CustomerAccountRow> {
  const rows = await tx.$queryRaw<CustomerAccountRow[]>(Prisma.sql`
    SELECT
      "id", "organizationId", "accountCode", "legalName", "displayName",
      "status"::text AS "status", "commercialMetadata", "lockVersion", "createdAt", "updatedAt"
    FROM "CustomerAccount"
    WHERE "id" = ${customerAccountId}::uuid
    FOR UPDATE
  `);
  if (rows.length !== 1) throw new CustomerAccountNotFoundError();
  return rows[0];
}

async function writePlatformAudit(
  tx: Prisma.TransactionClient,
  context: PlatformAuthorizationContext,
  event: {
    action: string;
    entityId: string;
    entityVersion: string;
    reason: string;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "PlatformAuditEvent" (
      "id", "actorIdentityId", "actorMembershipId", "action", "entityType",
      "entityId", "entityVersion", "reason", "metadata"
    ) VALUES (
      gen_random_uuid(), ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid,
      ${event.action}, 'CustomerAccount', ${event.entityId}::uuid, ${event.entityVersion},
      ${event.reason.trim()}, ${JSON.stringify(event.metadata)}::jsonb
    )
  `);
}

function mapRow(row: CustomerAccountRow): CustomerAccount {
  return {
    ...row,
    commercialMetadata: asMetadata(row.commercialMetadata),
  };
}

function asMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function validateReason(reason: string): void {
  if (!reason.trim() || reason.length > 1000) {
    throw new CustomerAccountValidationError("A reason between 1 and 1000 characters is required");
  }
}

function validateText(value: string, label: string, max: number): void {
  if (!value.trim() || value.length > max) {
    throw new CustomerAccountValidationError(`${label} is required and must be ${max} characters or fewer`);
  }
}

export class CustomerAccountNotFoundError extends Error {
  constructor() {
    super("Customer account not found");
    this.name = "CustomerAccountNotFoundError";
  }
}

export class CustomerAccountConflictError extends Error {
  constructor() {
    super("Customer account changed since it was loaded");
    this.name = "CustomerAccountConflictError";
  }
}

export class CustomerAccountValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomerAccountValidationError";
  }
}

export class CustomerAccountTransitionError extends Error {
  constructor(fromStatus: CustomerAccountStatus, toStatus: CustomerAccountStatus) {
    super(`Customer account cannot transition from ${fromStatus} to ${toStatus}`);
    this.name = "CustomerAccountTransitionError";
  }
}