import { Prisma } from "@prisma/client";
import { db } from "../db";
import {
  requirePlatformAuthorization,
  type PlatformAuthorizationContext,
} from "./authorization";

export type CatalogRecordStatus = "DRAFT" | "ACTIVE" | "RETIRED";
export type SubscriptionStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "CANCELLED" | "EXPIRED";
export type BillingCadence = "MONTHLY" | "ANNUAL" | "CUSTOM";
export type EntitlementOverrideDecision = "ENABLE" | "DISABLE";

export interface ProductRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: CatalogRecordStatus;
}

export interface FeatureRecord {
  id: string;
  productId: string;
  key: string;
  name: string;
  description: string | null;
  status: CatalogRecordStatus;
}

export interface PlanRecord {
  id: string;
  productId: string;
  code: string;
  name: string;
  description: string | null;
  status: CatalogRecordStatus;
}

export interface PlanVersionRecord {
  id: string;
  planId: string;
  version: number;
  status: CatalogRecordStatus;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  activatedAt: Date | null;
  billingCadence: BillingCadence | null;
  currency: string | null;
  baseAmountCents: number | null;
  includedFullUsers: number | null;
  additionalUserRateCents: number | null;
  storageAllowanceGb: number | null;
  commercialMetadata: unknown;
}

export interface SubscriptionRecord {
  id: string;
  customerAccountId: string;
  planVersionId: string;
  status: SubscriptionStatus;
  startsAt: Date;
  endsAt: Date | null;
  lockVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface EntitlementResolution {
  organizationId: string;
  featureKey: string;
  entitled: boolean;
  source: "OVERRIDE_ENABLE" | "OVERRIDE_DISABLE" | "PLAN" | "NONE";
  customerAccountId: string | null;
  subscriptionId: string | null;
  planVersionId: string | null;
}

const SUBSCRIPTION_TRANSITIONS: Readonly<Record<SubscriptionStatus, readonly SubscriptionStatus[]>> = {
  PENDING: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["SUSPENDED", "CANCELLED", "EXPIRED"],
  SUSPENDED: ["ACTIVE", "CANCELLED", "EXPIRED"],
  CANCELLED: [],
  EXPIRED: [],
};

export class SubscriptionCatalogService {
  async listProducts(context: PlatformAuthorizationContext): Promise<ProductRecord[]> {
    requirePlatformAuthorization(context, { permission: "platform.subscription.read" });
    return db.$queryRaw<ProductRecord[]>(Prisma.sql`
      SELECT "id", "code", "name", "description", "status"::text AS "status"
      FROM "Product" ORDER BY "code"
    `);
  }

  async createProduct(
    context: PlatformAuthorizationContext,
    input: { code: string; name: string; description?: string | null; reason: string },
  ): Promise<ProductRecord> {
    requirePlatformAuthorization(context, { permission: "platform.subscription.manage" });
    validateCode(input.code, "Product code");
    validateText(input.name, "Product name", 240);
    validateReason(input.reason);

    return db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ProductRecord[]>(Prisma.sql`
        INSERT INTO "Product" ("id", "code", "name", "description")
        VALUES (gen_random_uuid(), ${input.code.trim()}, ${input.name.trim()}, ${input.description?.trim() || null})
        RETURNING "id", "code", "name", "description", "status"::text AS "status"
      `);
      await writePlatformAudit(tx, context, "catalog.product.created", "Product", rows[0].id, input.reason, {
        code: rows[0].code,
      });
      return rows[0];
    });
  }

  async createFeature(
    context: PlatformAuthorizationContext,
    input: { productId: string; key: string; name: string; description?: string | null; reason: string },
  ): Promise<FeatureRecord> {
    requirePlatformAuthorization(context, { permission: "platform.subscription.manage" });
    validateCode(input.key, "Feature key");
    validateText(input.name, "Feature name", 240);
    validateReason(input.reason);

    return db.$transaction(async (tx) => {
      await requireActiveOrDraftProduct(tx, input.productId);
      const rows = await tx.$queryRaw<FeatureRecord[]>(Prisma.sql`
        INSERT INTO "Feature" ("id", "productId", "key", "name", "description")
        VALUES (gen_random_uuid(), ${input.productId}::uuid, ${input.key.trim()}, ${input.name.trim()}, ${input.description?.trim() || null})
        RETURNING "id", "productId", "key", "name", "description", "status"::text AS "status"
      `);
      await writePlatformAudit(tx, context, "catalog.feature.created", "Feature", rows[0].id, input.reason, {
        key: rows[0].key,
        productId: rows[0].productId,
      });
      return rows[0];
    });
  }

  async createPlan(
    context: PlatformAuthorizationContext,
    input: { productId: string; code: string; name: string; description?: string | null; reason: string },
  ): Promise<PlanRecord> {
    requirePlatformAuthorization(context, { permission: "platform.subscription.manage" });
    validateCode(input.code, "Plan code");
    validateText(input.name, "Plan name", 240);
    validateReason(input.reason);

    return db.$transaction(async (tx) => {
      await requireActiveOrDraftProduct(tx, input.productId);
      const rows = await tx.$queryRaw<PlanRecord[]>(Prisma.sql`
        INSERT INTO "Plan" ("id", "productId", "code", "name", "description")
        VALUES (gen_random_uuid(), ${input.productId}::uuid, ${input.code.trim()}, ${input.name.trim()}, ${input.description?.trim() || null})
        RETURNING "id", "productId", "code", "name", "description", "status"::text AS "status"
      `);
      await writePlatformAudit(tx, context, "catalog.plan.created", "Plan", rows[0].id, input.reason, {
        code: rows[0].code,
        productId: rows[0].productId,
      });
      return rows[0];
    });
  }

  async createPlanVersion(
    context: PlatformAuthorizationContext,
    input: { planId: string; effectiveFrom?: Date | null; effectiveTo?: Date | null; reason: string },
  ): Promise<PlanVersionRecord> {
    requirePlatformAuthorization(context, { permission: "platform.subscription.manage" });
    validateReason(input.reason);
    validateWindow(input.effectiveFrom ?? null, input.effectiveTo ?? null);

    return db.$transaction(async (tx) => {
      const versions = await tx.$queryRaw<{ nextVersion: number }[]>(Prisma.sql`
        SELECT COALESCE(MAX("version"), 0) + 1 AS "nextVersion"
        FROM "PlanVersion" WHERE "planId" = ${input.planId}::uuid
      `);
      const rows = await tx.$queryRaw<PlanVersionRecord[]>(Prisma.sql`
        INSERT INTO "PlanVersion" ("id", "planId", "version", "effectiveFrom", "effectiveTo")
        SELECT gen_random_uuid(), p."id", ${versions[0].nextVersion}, ${input.effectiveFrom ?? null}, ${input.effectiveTo ?? null}
        FROM "Plan" p WHERE p."id" = ${input.planId}::uuid AND p."status" <> 'RETIRED'
        RETURNING "id", "planId", "version", "status"::text AS "status", "effectiveFrom", "effectiveTo", "activatedAt", "billingCadence"::text AS "billingCadence", "currency", "baseAmountCents", "includedFullUsers", "additionalUserRateCents", "storageAllowanceGb", "commercialMetadata"
      `);
      if (rows.length !== 1) throw new SubscriptionValidationError("Plan is not available for versioning");
      await writePlatformAudit(tx, context, "catalog.plan_version.created", "PlanVersion", rows[0].id, input.reason, {
        planId: rows[0].planId,
        version: rows[0].version,
      });
      return rows[0];
    });
  }

  async setDraftCommercialTerms(
    context: PlatformAuthorizationContext,
    input: {
      planVersionId: string;
      billingCadence: BillingCadence;
      currency: string;
      baseAmountCents: number;
      includedFullUsers: number;
      additionalUserRateCents?: number | null;
      storageAllowanceGb?: number | null;
      commercialMetadata?: Record<string, unknown>;
      reason: string;
    },
  ): Promise<PlanVersionRecord> {
    requirePlatformAuthorization(context, { permission: "platform.subscription.manage" });
    validateReason(input.reason);
    validateCommercialTerms(input);

    return db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<PlanVersionRecord[]>(Prisma.sql`
        UPDATE "PlanVersion"
        SET "billingCadence"=${input.billingCadence}::"BillingCadence",
            "currency"=${input.currency.trim().toUpperCase()},
            "baseAmountCents"=${input.baseAmountCents},
            "includedFullUsers"=${input.includedFullUsers},
            "additionalUserRateCents"=${input.additionalUserRateCents ?? null},
            "storageAllowanceGb"=${input.storageAllowanceGb ?? null},
            "commercialMetadata"=${JSON.stringify(input.commercialMetadata ?? {})}::jsonb
        WHERE "id"=${input.planVersionId}::uuid AND "status"='DRAFT'
        RETURNING "id","planId","version","status"::text AS "status","effectiveFrom","effectiveTo","activatedAt",
          "billingCadence"::text AS "billingCadence","currency","baseAmountCents","includedFullUsers",
          "additionalUserRateCents","storageAllowanceGb","commercialMetadata"
      `);
      if (rows.length !== 1) throw new SubscriptionValidationError("Commercial terms can only be changed on a draft plan version");
      await writePlatformAudit(tx, context, "catalog.plan_version.commercial_terms.set", "PlanVersion", rows[0].id, input.reason, {
        billingCadence: rows[0].billingCadence,
        currency: rows[0].currency,
        baseAmountCents: rows[0].baseAmountCents,
        includedFullUsers: rows[0].includedFullUsers,
        additionalUserRateCents: rows[0].additionalUserRateCents,
        storageAllowanceGb: rows[0].storageAllowanceGb,
      });
      return rows[0];
    });
  }

  async setDraftPlanFeature(
    context: PlatformAuthorizationContext,
    input: { planVersionId: string; featureId: string; enabled: boolean; reason: string },
  ): Promise<void> {
    requirePlatformAuthorization(context, { permission: "platform.subscription.manage" });
    validateReason(input.reason);

    await db.$transaction(async (tx) => {
      const compatible = await tx.$queryRaw<{ ok: boolean }[]>(Prisma.sql`
        SELECT true AS "ok"
        FROM "PlanVersion" pv
        INNER JOIN "Plan" p ON p."id" = pv."planId"
        INNER JOIN "Feature" f ON f."id" = ${input.featureId}::uuid
        WHERE pv."id" = ${input.planVersionId}::uuid
          AND pv."status" = 'DRAFT'
          AND f."productId" = p."productId"
          AND f."status" <> 'RETIRED'
      `);
      if (compatible.length !== 1) throw new SubscriptionValidationError("Feature is not compatible with the draft plan version");

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PlanFeature" ("planVersionId", "featureId", "enabled")
        VALUES (${input.planVersionId}::uuid, ${input.featureId}::uuid, ${input.enabled})
        ON CONFLICT ("planVersionId", "featureId") DO UPDATE SET "enabled" = EXCLUDED."enabled"
      `);
      await writePlatformAudit(tx, context, "catalog.plan_feature.set", "PlanVersion", input.planVersionId, input.reason, {
        featureId: input.featureId,
        enabled: input.enabled,
      });
    });
  }

  async activatePlanVersion(
    context: PlatformAuthorizationContext,
    input: { planVersionId: string; reason: string },
  ): Promise<PlanVersionRecord> {
    requirePlatformAuthorization(context, { permission: "platform.subscription.manage" });
    validateReason(input.reason);

    return db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<PlanVersionRecord[]>(Prisma.sql`
        UPDATE "PlanVersion"
        SET "status" = 'ACTIVE', "activatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.planVersionId}::uuid AND "status" = 'DRAFT'
        RETURNING "id", "planId", "version", "status"::text AS "status", "effectiveFrom", "effectiveTo", "activatedAt"
      `);
      if (rows.length !== 1) throw new SubscriptionValidationError("Only a draft plan version can be activated");
      await tx.$executeRaw(Prisma.sql`UPDATE "Plan" SET "status" = 'ACTIVE', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${rows[0].planId}::uuid AND "status" = 'DRAFT'`);
      await tx.$executeRaw(Prisma.sql`UPDATE "Product" p SET "status" = 'ACTIVE', "updatedAt" = CURRENT_TIMESTAMP FROM "Plan" pl WHERE pl."id" = ${rows[0].planId}::uuid AND pl."productId" = p."id" AND p."status" = 'DRAFT'`);
      await writePlatformAudit(tx, context, "catalog.plan_version.activated", "PlanVersion", rows[0].id, input.reason, {
        planId: rows[0].planId,
        version: rows[0].version,
      });
      return rows[0];
    });
  }

  async createSubscription(
    context: PlatformAuthorizationContext,
    input: { customerAccountId: string; planVersionId: string; startsAt: Date; endsAt?: Date | null; reason: string },
  ): Promise<SubscriptionRecord> {
    requirePlatformAuthorization(context, { permission: "platform.subscription.manage" });
    validateReason(input.reason);
    validateWindow(input.startsAt, input.endsAt ?? null);

    return db.$transaction(async (tx) => {
      const eligible = await tx.$queryRaw<{ ok: boolean }[]>(Prisma.sql`
        SELECT true AS "ok"
        FROM "CustomerAccount" ca, "PlanVersion" pv
        WHERE ca."id" = ${input.customerAccountId}::uuid
          AND ca."status" = 'ACTIVE'
          AND ca."organizationId" IS NOT NULL
          AND pv."id" = ${input.planVersionId}::uuid
          AND pv."status" = 'ACTIVE'
      `);
      if (eligible.length !== 1) throw new SubscriptionValidationError("Customer and plan version must both be active");

      const rows = await tx.$queryRaw<SubscriptionRecord[]>(Prisma.sql`
        INSERT INTO "Subscription" ("id", "customerAccountId", "planVersionId", "startsAt", "endsAt")
        VALUES (gen_random_uuid(), ${input.customerAccountId}::uuid, ${input.planVersionId}::uuid, ${input.startsAt}, ${input.endsAt ?? null})
        RETURNING "id", "customerAccountId", "planVersionId", "status"::text AS "status", "startsAt", "endsAt", "lockVersion", "createdAt", "updatedAt"
      `);
      await insertSubscriptionChange(tx, context, rows[0], null, input.reason, { operation: "CREATE" });
      await writePlatformAudit(tx, context, "subscription.created", "Subscription", rows[0].id, input.reason, {
        customerAccountId: rows[0].customerAccountId,
        planVersionId: rows[0].planVersionId,
      });
      return rows[0];
    });
  }

  async transitionSubscription(
    context: PlatformAuthorizationContext,
    input: {
      subscriptionId: string;
      toStatus: SubscriptionStatus;
      expectedLockVersion: number;
      reason: string;
      planVersionId?: string;
    },
  ): Promise<SubscriptionRecord> {
    requirePlatformAuthorization(context, { permission: "platform.subscription.manage" });
    validateReason(input.reason);

    return db.$transaction(async (tx) => {
      const existingRows = await tx.$queryRaw<SubscriptionRecord[]>(Prisma.sql`
        SELECT "id", "customerAccountId", "planVersionId", "status"::text AS "status", "startsAt", "endsAt", "lockVersion", "createdAt", "updatedAt"
        FROM "Subscription" WHERE "id" = ${input.subscriptionId}::uuid FOR UPDATE
      `);
      if (existingRows.length !== 1) throw new SubscriptionNotFoundError();
      const existing = existingRows[0];
      if (existing.lockVersion !== input.expectedLockVersion) throw new SubscriptionConflictError();
      if (!SUBSCRIPTION_TRANSITIONS[existing.status].includes(input.toStatus)) {
        throw new SubscriptionValidationError(`Subscription cannot transition from ${existing.status} to ${input.toStatus}`);
      }

      const nextPlanVersionId = input.planVersionId ?? existing.planVersionId;
      if (nextPlanVersionId !== existing.planVersionId) {
        const activePlans = await tx.$queryRaw<{ ok: boolean }[]>(Prisma.sql`SELECT true AS "ok" FROM "PlanVersion" WHERE "id" = ${nextPlanVersionId}::uuid AND "status" = 'ACTIVE'`);
        if (activePlans.length !== 1) throw new SubscriptionValidationError("Replacement plan version must be active");
      }

      const rows = await tx.$queryRaw<SubscriptionRecord[]>(Prisma.sql`
        UPDATE "Subscription"
        SET "status" = ${input.toStatus}::"SubscriptionStatus",
            "planVersionId" = ${nextPlanVersionId}::uuid,
            "lockVersion" = "lockVersion" + 1,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${existing.id}::uuid AND "lockVersion" = ${input.expectedLockVersion}
        RETURNING "id", "customerAccountId", "planVersionId", "status"::text AS "status", "startsAt", "endsAt", "lockVersion", "createdAt", "updatedAt"
      `);
      if (rows.length !== 1) throw new SubscriptionConflictError();
      await insertSubscriptionChange(tx, context, rows[0], existing, input.reason, { operation: "TRANSITION" });
      await writePlatformAudit(tx, context, "subscription.changed", "Subscription", rows[0].id, input.reason, {
        fromStatus: existing.status,
        toStatus: rows[0].status,
        fromPlanVersionId: existing.planVersionId,
        toPlanVersionId: rows[0].planVersionId,
      });
      return rows[0];
    });
  }

  async createEntitlementOverride(
    context: PlatformAuthorizationContext,
    input: {
      customerAccountId: string;
      featureId: string;
      decision: EntitlementOverrideDecision;
      effectiveFrom: Date;
      effectiveTo?: Date | null;
      reason: string;
    },
  ): Promise<{ id: string }> {
    requirePlatformAuthorization(context, { permission: "platform.entitlement.manage" });
    validateReason(input.reason);
    validateWindow(input.effectiveFrom, input.effectiveTo ?? null);

    return db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO "EntitlementOverride" (
          "id", "customerAccountId", "featureId", "decision", "effectiveFrom", "effectiveTo",
          "reason", "createdByIdentityId", "createdByMembershipId"
        )
        SELECT gen_random_uuid(), ca."id", f."id", ${input.decision}::"EntitlementOverrideDecision",
          ${input.effectiveFrom}, ${input.effectiveTo ?? null}, ${input.reason.trim()},
          ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid
        FROM "CustomerAccount" ca, "Feature" f
        WHERE ca."id" = ${input.customerAccountId}::uuid AND ca."status" = 'ACTIVE'
          AND f."id" = ${input.featureId}::uuid AND f."status" = 'ACTIVE'
        RETURNING "id"
      `);
      if (rows.length !== 1) throw new SubscriptionValidationError("Entitlement override requires an active customer and active feature");
      await writePlatformAudit(tx, context, "entitlement.override.created", "EntitlementOverride", rows[0].id, input.reason, {
        customerAccountId: input.customerAccountId,
        featureId: input.featureId,
        decision: input.decision,
      });
      return rows[0];
    });
  }

  async revokeEntitlementOverride(
    context: PlatformAuthorizationContext,
    input: { overrideId: string; reason: string },
  ): Promise<void> {
    requirePlatformAuthorization(context, { permission: "platform.entitlement.manage" });
    validateReason(input.reason);

    await db.$transaction(async (tx) => {
      const changed = await tx.$executeRaw(Prisma.sql`
        UPDATE "EntitlementOverride"
        SET "revokedAt" = CURRENT_TIMESTAMP,
            "revokedByIdentityId" = ${context.platformIdentityId}::uuid,
            "revocationReason" = ${input.reason.trim()}
        WHERE "id" = ${input.overrideId}::uuid AND "revokedAt" IS NULL
      `);
      if (changed !== 1) throw new SubscriptionValidationError("Active entitlement override not found");
      await writePlatformAudit(tx, context, "entitlement.override.revoked", "EntitlementOverride", input.overrideId, input.reason, {});
    });
  }
}

export async function resolveCustomerEntitlement(
  organizationId: string,
  featureKey: string,
  at = new Date(),
): Promise<EntitlementResolution> {
  const customerRows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "CustomerAccount"
    WHERE "organizationId" = ${organizationId}::uuid AND "status" = 'ACTIVE'
    LIMIT 1
  `);
  if (customerRows.length !== 1) return none(organizationId, featureKey);
  const customerAccountId = customerRows[0].id;

  const overrides = await db.$queryRaw<{ decision: EntitlementOverrideDecision }[]>(Prisma.sql`
    SELECT eo."decision"::text AS "decision"
    FROM "EntitlementOverride" eo
    INNER JOIN "Feature" f ON f."id" = eo."featureId"
    WHERE eo."customerAccountId" = ${customerAccountId}::uuid
      AND f."key" = ${featureKey}
      AND f."status" = 'ACTIVE'
      AND eo."revokedAt" IS NULL
      AND eo."effectiveFrom" <= ${at}
      AND (eo."effectiveTo" IS NULL OR eo."effectiveTo" > ${at})
    ORDER BY eo."createdAt" DESC
    LIMIT 1
  `);
  if (overrides.length === 1) {
    return {
      organizationId,
      featureKey,
      entitled: overrides[0].decision === "ENABLE",
      source: overrides[0].decision === "ENABLE" ? "OVERRIDE_ENABLE" : "OVERRIDE_DISABLE",
      customerAccountId,
      subscriptionId: null,
      planVersionId: null,
    };
  }

  const subscriptions = await db.$queryRaw<{ subscriptionId: string; planVersionId: string }[]>(Prisma.sql`
    SELECT s."id" AS "subscriptionId", s."planVersionId"
    FROM "Subscription" s
    INNER JOIN "PlanVersion" pv ON pv."id" = s."planVersionId"
    INNER JOIN "PlanFeature" pf ON pf."planVersionId" = pv."id" AND pf."enabled" = true
    INNER JOIN "Feature" f ON f."id" = pf."featureId"
    WHERE s."customerAccountId" = ${customerAccountId}::uuid
      AND s."status" = 'ACTIVE'
      AND s."startsAt" <= ${at}
      AND (s."endsAt" IS NULL OR s."endsAt" > ${at})
      AND pv."status" = 'ACTIVE'
      AND (pv."effectiveFrom" IS NULL OR pv."effectiveFrom" <= ${at})
      AND (pv."effectiveTo" IS NULL OR pv."effectiveTo" > ${at})
      AND f."key" = ${featureKey}
      AND f."status" = 'ACTIVE'
    ORDER BY s."createdAt" DESC
    LIMIT 1
  `);
  if (subscriptions.length === 1) {
    return {
      organizationId,
      featureKey,
      entitled: true,
      source: "PLAN",
      customerAccountId,
      subscriptionId: subscriptions[0].subscriptionId,
      planVersionId: subscriptions[0].planVersionId,
    };
  }

  return { ...none(organizationId, featureKey), customerAccountId };
}

export async function requireTenantFeatureEntitlement(
  organizationId: string,
  featureKey: string,
  at = new Date(),
): Promise<EntitlementResolution> {
  const resolution = await resolveCustomerEntitlement(organizationId, featureKey, at);
  if (!resolution.entitled) throw new FeatureNotEntitledError(featureKey);
  return resolution;
}

function none(organizationId: string, featureKey: string): EntitlementResolution {
  return {
    organizationId,
    featureKey,
    entitled: false,
    source: "NONE",
    customerAccountId: null,
    subscriptionId: null,
    planVersionId: null,
  };
}

async function requireActiveOrDraftProduct(tx: Prisma.TransactionClient, productId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ ok: boolean }[]>(Prisma.sql`SELECT true AS "ok" FROM "Product" WHERE "id" = ${productId}::uuid AND "status" <> 'RETIRED'`);
  if (rows.length !== 1) throw new SubscriptionValidationError("Product is not available");
}

async function insertSubscriptionChange(
  tx: Prisma.TransactionClient,
  context: PlatformAuthorizationContext,
  next: SubscriptionRecord,
  previous: SubscriptionRecord | null,
  reason: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "SubscriptionChange" (
      "id", "subscriptionId", "fromStatus", "toStatus", "fromPlanVersionId", "toPlanVersionId",
      "actorIdentityId", "actorMembershipId", "reason", "metadata"
    ) VALUES (
      gen_random_uuid(), ${next.id}::uuid, ${previous?.status ?? null}::"SubscriptionStatus",
      ${next.status}::"SubscriptionStatus", ${previous?.planVersionId ?? null}::uuid, ${next.planVersionId}::uuid,
      ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid,
      ${reason.trim()}, ${JSON.stringify(metadata)}::jsonb
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

function validateCode(value: string, label: string): void {
  if (!value.trim() || value.length > 120 || !/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new SubscriptionValidationError(`${label} is required and may contain letters, numbers, dot, underscore, and hyphen`);
  }
}

function validateText(value: string, label: string, max: number): void {
  if (!value.trim() || value.length > max) throw new SubscriptionValidationError(`${label} is required and must be ${max} characters or fewer`);
}

function validateReason(reason: string): void {
  if (!reason.trim() || reason.length > 1000) throw new SubscriptionValidationError("A reason between 1 and 1000 characters is required");
}

function validateWindow(from: Date | null, to: Date | null): void {
  if (from && to && to <= from) throw new SubscriptionValidationError("Effective end must be after effective start");
}

export class SubscriptionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionValidationError";
  }
}

export class SubscriptionNotFoundError extends Error {
  constructor() {
    super("Subscription not found");
    this.name = "SubscriptionNotFoundError";
  }
}

export class SubscriptionConflictError extends Error {
  constructor() {
    super("Subscription changed since it was loaded");
    this.name = "SubscriptionConflictError";
  }
}

export class FeatureNotEntitledError extends Error {
  constructor(public readonly featureKey: string) {
    super(`Feature is not entitled: ${featureKey}`);
    this.name = "FeatureNotEntitledError";
  }
}
function validateCommercialTerms(input: {
  billingCadence: BillingCadence;
  currency: string;
  baseAmountCents: number;
  includedFullUsers: number;
  additionalUserRateCents?: number | null;
  storageAllowanceGb?: number | null;
}): void {
  if (!/^[A-Z]{3}$/.test(input.currency.trim().toUpperCase())) throw new SubscriptionValidationError("Currency must be a 3-letter ISO code");
  for (const [label, value] of [
    ["Base amount", input.baseAmountCents],
    ["Included full users", input.includedFullUsers],
    ["Additional user rate", input.additionalUserRateCents ?? 0],
    ["Storage allowance", input.storageAllowanceGb ?? 0],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) throw new SubscriptionValidationError(`${label} must be a non-negative integer`);
  }
}
