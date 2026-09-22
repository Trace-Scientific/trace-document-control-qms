import { Prisma } from "@prisma/client";
import { db } from "../db";
import type { PlatformAuthorizationContext } from "./authorization";
import { requirePlatformAuthorization } from "./authorization";

export type CommissionAccrualStatus = "PENDING" | "EARNED" | "APPROVED" | "PAID";
export type CommissionRuleType = "PERCENTAGE" | "FIXED";

export class SalesCommissionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalesCommissionValidationError";
  }
}

export class SalesCommissionNotFoundError extends Error {
  constructor(message = "Sales or commission record not found") {
    super(message);
    this.name = "SalesCommissionNotFoundError";
  }
}

export class SalesCommissionConflictError extends Error {
  constructor(message = "Sales or commission record changed; refresh and retry") {
    super(message);
    this.name = "SalesCommissionConflictError";
  }
}

const TRANSITIONS: Record<CommissionAccrualStatus, CommissionAccrualStatus[]> = {
  PENDING: ["EARNED"],
  EARNED: ["APPROVED"],
  APPROVED: [],
  PAID: [],
};

function validateReason(reason: string) {
  if (!reason.trim()) throw new SalesCommissionValidationError("A reason is required");
}

function validateWindow(startsAt: Date, endsAt?: Date | null) {
  if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime()))) {
    throw new SalesCommissionValidationError("Invalid effective date");
  }
  if (endsAt && endsAt <= startsAt) throw new SalesCommissionValidationError("End must be after start");
}

async function audit(
  tx: Prisma.TransactionClient,
  context: PlatformAuthorizationContext,
  action: string,
  entityType: string,
  entityId: string,
  reason: string,
  metadata: Prisma.InputJsonObject = {},
) {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "PlatformAuditEvent" (
      "id", "actorIdentityId", "actorMembershipId", "action", "entityType", "entityId", "reason", "metadata"
    ) VALUES (
      gen_random_uuid(), ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid,
      ${action}, ${entityType}, ${entityId}::uuid, ${reason}, ${JSON.stringify(metadata)}::jsonb
    )
  `);
}

export class SalesCommissionService {
  async listRepresentatives(context: PlatformAuthorizationContext) {
    requirePlatformAuthorization(context, { permission: "platform.sales.read" });
    return db.$queryRaw(Prisma.sql`
      SELECT sr."id", sr."platformIdentityId", sr."displayName", sr."status"::text AS "status", sr."createdAt", sr."updatedAt"
      FROM "SalesRepresentative" sr ORDER BY sr."displayName"
    `);
  }

  async salesWorkspace(context: PlatformAuthorizationContext) {
    requirePlatformAuthorization(context, { permission: "platform.sales.read" });
    const [representatives, assignments, identities] = await Promise.all([
      this.listRepresentatives(context),
      this.listAssignments(context),
      db.$queryRaw<Array<{id:string;email:string;status:string}>>(Prisma.sql`
        SELECT "id","email","status"::text AS "status"
        FROM "PlatformIdentity"
        WHERE "status"='ACTIVE'
        ORDER BY "email"
      `)
    ]);
    return { representatives, assignments, identities };
  }

  async createRepresentative(
    context: PlatformAuthorizationContext,
    input: { platformIdentityId: string; displayName: string; reason: string },
  ) {
    requirePlatformAuthorization(context, { permission: "platform.sales.manage" });
    validateReason(input.reason);
    if (!input.displayName.trim()) throw new SalesCommissionValidationError("Display name is required");
    return db.$transaction(async (tx) => {
      const identities = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "PlatformIdentity" WHERE "id" = ${input.platformIdentityId}::uuid AND "status" = 'ACTIVE'
      `);
      if (identities.length !== 1) throw new SalesCommissionValidationError("Active platform identity is required");
      const rows = await tx.$queryRaw<{ id: string; platformIdentityId: string; displayName: string; status: string }[]>(Prisma.sql`
        INSERT INTO "SalesRepresentative" ("id", "platformIdentityId", "displayName", "updatedAt")
        VALUES (gen_random_uuid(), ${input.platformIdentityId}::uuid, ${input.displayName.trim()}, CURRENT_TIMESTAMP)
        RETURNING "id", "platformIdentityId", "displayName", "status"::text AS "status"
      `);
      await audit(tx, context, "sales.representative.created", "SalesRepresentative", rows[0].id, input.reason, {
        platformIdentityId: input.platformIdentityId,
      });
      return rows[0];
    });
  }

  async listAssignments(context: PlatformAuthorizationContext) {
    requirePlatformAuthorization(context, { permission: "platform.sales.read" });
    return db.$queryRaw(Prisma.sql`
      SELECT sa."id", sa."salesRepresentativeId", sr."displayName" AS "salesRepresentativeName",
             sa."customerAccountId", ca."displayName" AS "customerName", sa."startsAt", sa."endsAt", sa."createdAt"
      FROM "SalesAssignment" sa
      INNER JOIN "SalesRepresentative" sr ON sr."id" = sa."salesRepresentativeId"
      INNER JOIN "CustomerAccount" ca ON ca."id" = sa."customerAccountId"
      ORDER BY sa."startsAt" DESC
    `);
  }

  async createAssignment(
    context: PlatformAuthorizationContext,
    input: { salesRepresentativeId: string; customerAccountId: string; startsAt: Date; endsAt?: Date | null; reason: string },
  ) {
    requirePlatformAuthorization(context, { permission: "platform.sales.manage" });
    validateReason(input.reason);
    validateWindow(input.startsAt, input.endsAt);
    return db.$transaction(async (tx) => {
      const eligible = await tx.$queryRaw<{ ok: boolean }[]>(Prisma.sql`
        SELECT true AS "ok"
        FROM "SalesRepresentative" sr, "CustomerAccount" ca
        WHERE sr."id" = ${input.salesRepresentativeId}::uuid AND sr."status" = 'ACTIVE'
          AND ca."id" = ${input.customerAccountId}::uuid AND ca."status" <> 'TERMINATED'
      `);
      if (eligible.length !== 1) throw new SalesCommissionValidationError("Active representative and non-terminated customer are required");
      const overlap = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "SalesAssignment"
        WHERE "customerAccountId" = ${input.customerAccountId}::uuid
          AND tstzrange("startsAt", COALESCE("endsAt", 'infinity'::timestamptz), '[)') &&
              tstzrange(${input.startsAt}, COALESCE(${input.endsAt ?? null}::timestamptz, 'infinity'::timestamptz), '[)')
        LIMIT 1
      `);
      if (overlap.length) throw new SalesCommissionConflictError("Customer already has an overlapping sales assignment");
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO "SalesAssignment" ("id", "salesRepresentativeId", "customerAccountId", "startsAt", "endsAt")
        VALUES (gen_random_uuid(), ${input.salesRepresentativeId}::uuid, ${input.customerAccountId}::uuid, ${input.startsAt}, ${input.endsAt ?? null})
        RETURNING "id"
      `);
      await audit(tx, context, "sales.assignment.created", "SalesAssignment", rows[0].id, input.reason, {
        salesRepresentativeId: input.salesRepresentativeId,
        customerAccountId: input.customerAccountId,
      });
      return rows[0];
    });
  }

  async createCommissionPlan(
    context: PlatformAuthorizationContext,
    input: { code: string; name: string; reason: string },
  ) {
    requirePlatformAuthorization(context, { permission: "platform.commission.manage" });
    validateReason(input.reason);
    if (!input.code.trim() || !input.name.trim()) throw new SalesCommissionValidationError("Plan code and name are required");
    return db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; code: string; name: string; status: string }[]>(Prisma.sql`
        INSERT INTO "CommissionPlan" ("id", "code", "name", "updatedAt")
        VALUES (gen_random_uuid(), ${input.code.trim()}, ${input.name.trim()}, CURRENT_TIMESTAMP)
        RETURNING "id", "code", "name", "status"::text AS "status"
      `);
      await audit(tx, context, "commission.plan.created", "CommissionPlan", rows[0].id, input.reason);
      return rows[0];
    });
  }

  async createPlanVersion(
    context: PlatformAuthorizationContext,
    input: { commissionPlanId: string; version: number; effectiveFrom: Date; effectiveTo?: Date | null; reason: string },
  ) {
    requirePlatformAuthorization(context, { permission: "platform.commission.manage" });
    validateReason(input.reason);
    validateWindow(input.effectiveFrom, input.effectiveTo);
    if (!Number.isInteger(input.version) || input.version < 1) throw new SalesCommissionValidationError("Version must be a positive integer");
    return db.$transaction(async (tx) => {
      const plans = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT "id" FROM "CommissionPlan" WHERE "id" = ${input.commissionPlanId}::uuid AND "status" <> 'RETIRED'`);
      if (plans.length !== 1) throw new SalesCommissionNotFoundError("Commission plan not found");
      const rows = await tx.$queryRaw<{ id: string; commissionPlanId: string; version: number; status: string }[]>(Prisma.sql`
        INSERT INTO "CommissionPlanVersion" ("id", "commissionPlanId", "version", "effectiveFrom", "effectiveTo")
        VALUES (gen_random_uuid(), ${input.commissionPlanId}::uuid, ${input.version}, ${input.effectiveFrom}, ${input.effectiveTo ?? null})
        RETURNING "id", "commissionPlanId", "version", "status"::text AS "status"
      `);
      await audit(tx, context, "commission.plan_version.created", "CommissionPlanVersion", rows[0].id, input.reason, { version: input.version });
      return rows[0];
    });
  }

  async addRule(
    context: PlatformAuthorizationContext,
    input: {
      commissionPlanVersionId: string;
      ruleCode: string;
      ruleType: CommissionRuleType;
      rate?: number | null;
      fixedAmount?: number | null;
      currency?: string;
      description: string;
      reason: string;
    },
  ) {
    requirePlatformAuthorization(context, { permission: "platform.commission.manage" });
    validateReason(input.reason);
    const currency = (input.currency ?? "USD").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new SalesCommissionValidationError("Currency must be a three-letter code");
    if (input.ruleType === "PERCENTAGE" && (input.rate == null || input.rate < 0 || input.fixedAmount != null)) {
      throw new SalesCommissionValidationError("Percentage rule requires a nonnegative rate only");
    }
    if (input.ruleType === "FIXED" && (input.fixedAmount == null || input.fixedAmount < 0 || input.rate != null)) {
      throw new SalesCommissionValidationError("Fixed rule requires a nonnegative fixed amount only");
    }
    return db.$transaction(async (tx) => {
      const versions = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT "id" FROM "CommissionPlanVersion" WHERE "id" = ${input.commissionPlanVersionId}::uuid AND "status" = 'DRAFT'`);
      if (versions.length !== 1) throw new SalesCommissionValidationError("Rules may be added only to draft plan versions");
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO "CommissionRule" ("id", "commissionPlanVersionId", "ruleCode", "ruleType", "rate", "fixedAmount", "currency", "description")
        VALUES (gen_random_uuid(), ${input.commissionPlanVersionId}::uuid, ${input.ruleCode.trim()}, ${input.ruleType}::"CommissionRuleType",
          ${input.rate ?? null}, ${input.fixedAmount ?? null}, ${currency}, ${input.description.trim()})
        RETURNING "id"
      `);
      await audit(tx, context, "commission.rule.created", "CommissionRule", rows[0].id, input.reason, { commissionPlanVersionId: input.commissionPlanVersionId });
      return rows[0];
    });
  }

  async activatePlanVersion(context: PlatformAuthorizationContext, input: { commissionPlanVersionId: string; reason: string }) {
    requirePlatformAuthorization(context, { permission: "platform.commission.manage" });
    validateReason(input.reason);
    return db.$transaction(async (tx) => {
      const rules = await tx.$queryRaw<{ count: bigint }[]>(Prisma.sql`SELECT COUNT(*)::bigint AS "count" FROM "CommissionRule" WHERE "commissionPlanVersionId" = ${input.commissionPlanVersionId}::uuid`);
      if (!rules[0] || Number(rules[0].count) < 1) throw new SalesCommissionValidationError("At least one commission rule is required before activation");
      const rows = await tx.$queryRaw<{ id: string; commissionPlanId: string }[]>(Prisma.sql`
        UPDATE "CommissionPlanVersion" SET "status" = 'ACTIVE', "activatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.commissionPlanVersionId}::uuid AND "status" = 'DRAFT'
        RETURNING "id", "commissionPlanId"
      `);
      if (rows.length !== 1) throw new SalesCommissionValidationError("Only a draft plan version can be activated");
      await tx.$executeRaw(Prisma.sql`UPDATE "CommissionPlan" SET "status" = 'ACTIVE', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${rows[0].commissionPlanId}::uuid AND "status" = 'DRAFT'`);
      await audit(tx, context, "commission.plan_version.activated", "CommissionPlanVersion", rows[0].id, input.reason);
      return rows[0];
    });
  }

  async listAccruals(context: PlatformAuthorizationContext) {
    requirePlatformAuthorization(context, { permission: "platform.commission.read" });
    return db.$queryRaw(Prisma.sql`
      SELECT ca."id", ca."salesRepresentativeId", sr."displayName" AS "salesRepresentativeName", ca."customerAccountId",
             cust."displayName" AS "customerName", ca."status"::text AS "status", ca."sourceType", ca."sourceReference",
             ca."basisAmount", ca."commissionAmount", ca."currency", ca."lockVersion", ca."createdAt"
      FROM "CommissionAccrual" ca
      INNER JOIN "SalesRepresentative" sr ON sr."id" = ca."salesRepresentativeId"
      INNER JOIN "CustomerAccount" cust ON cust."id" = ca."customerAccountId"
      ORDER BY ca."createdAt" DESC
    `);
  }

  async createAccrual(
    context: PlatformAuthorizationContext,
    input: {
      salesAssignmentId: string;
      commissionRuleId: string;
      sourceType: string;
      sourceReference: string;
      basisAmount: number;
      reason: string;
    },
  ) {
    requirePlatformAuthorization(context, { permission: "platform.commission.manage" });
    validateReason(input.reason);
    if (input.basisAmount < 0 || !Number.isFinite(input.basisAmount)) throw new SalesCommissionValidationError("Basis amount must be nonnegative");
    return db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{
        salesRepresentativeId: string;
        customerAccountId: string;
        commissionPlanVersionId: string;
        commissionRuleId: string;
        ruleType: CommissionRuleType;
        rate: Prisma.Decimal | null;
        fixedAmount: Prisma.Decimal | null;
        currency: string;
        ruleCode: string;
        description: string;
      }[]>(Prisma.sql`
        SELECT sa."salesRepresentativeId", sa."customerAccountId", cr."commissionPlanVersionId", cr."id" AS "commissionRuleId",
               cr."ruleType"::text AS "ruleType", cr."rate", cr."fixedAmount", cr."currency", cr."ruleCode", cr."description"
        FROM "SalesAssignment" sa
        INNER JOIN "SalesRepresentative" sr ON sr."id" = sa."salesRepresentativeId" AND sr."status" = 'ACTIVE'
        INNER JOIN "CustomerAccount" cust ON cust."id" = sa."customerAccountId" AND cust."status" = 'ACTIVE'
        INNER JOIN "CommissionRule" cr ON cr."id" = ${input.commissionRuleId}::uuid
        INNER JOIN "CommissionPlanVersion" cpv ON cpv."id" = cr."commissionPlanVersionId" AND cpv."status" = 'ACTIVE'
        WHERE sa."id" = ${input.salesAssignmentId}::uuid
          AND sa."startsAt" <= CURRENT_TIMESTAMP AND (sa."endsAt" IS NULL OR sa."endsAt" > CURRENT_TIMESTAMP)
          AND cpv."effectiveFrom" <= CURRENT_TIMESTAMP AND (cpv."effectiveTo" IS NULL OR cpv."effectiveTo" > CURRENT_TIMESTAMP)
      `);
      if (rows.length !== 1) throw new SalesCommissionValidationError("Active sales assignment and active commission rule are required");
      const rule = rows[0];
      const commissionAmount = rule.ruleType === "PERCENTAGE"
        ? input.basisAmount * Number(rule.rate ?? 0)
        : Number(rule.fixedAmount ?? 0);
      const snapshot = {
        ruleCode: rule.ruleCode,
        ruleType: rule.ruleType,
        rate: rule.rate?.toString() ?? null,
        fixedAmount: rule.fixedAmount?.toString() ?? null,
        currency: rule.currency,
        description: rule.description,
      };
      const accruals = await tx.$queryRaw<{ id: string; status: CommissionAccrualStatus; lockVersion: number }[]>(Prisma.sql`
        INSERT INTO "CommissionAccrual" (
          "id", "salesRepresentativeId", "salesAssignmentId", "customerAccountId", "commissionPlanVersionId", "commissionRuleId",
          "sourceType", "sourceReference", "basisAmount", "commissionAmount", "currency", "ruleSnapshot", "updatedAt"
        ) VALUES (
          gen_random_uuid(), ${rule.salesRepresentativeId}::uuid, ${input.salesAssignmentId}::uuid, ${rule.customerAccountId}::uuid,
          ${rule.commissionPlanVersionId}::uuid, ${rule.commissionRuleId}::uuid, ${input.sourceType.trim()}, ${input.sourceReference.trim()},
          ${input.basisAmount}, ${commissionAmount}, ${rule.currency}, ${JSON.stringify(snapshot)}::jsonb, CURRENT_TIMESTAMP
        ) RETURNING "id", "status"::text AS "status", "lockVersion"
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "CommissionAccrualEvent" ("id", "commissionAccrualId", "fromStatus", "toStatus", "actorIdentityId", "actorMembershipId", "reason")
        VALUES (gen_random_uuid(), ${accruals[0].id}::uuid, NULL, 'PENDING', ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid, ${input.reason})
      `);
      await audit(tx, context, "commission.accrual.created", "CommissionAccrual", accruals[0].id, input.reason, {
        commissionRuleId: input.commissionRuleId,
        sourceType: input.sourceType,
        sourceReference: input.sourceReference,
      });
      return accruals[0];
    });
  }

  async transitionAccrual(
    context: PlatformAuthorizationContext,
    input: { commissionAccrualId: string; toStatus: Exclude<CommissionAccrualStatus, "PAID">; expectedLockVersion: number; reason: string },
  ) {
    requirePlatformAuthorization(context, { permission: "platform.commission.manage" });
    validateReason(input.reason);
    return db.$transaction(async (tx) => {
      const existing = await tx.$queryRaw<{ id: string; status: CommissionAccrualStatus; lockVersion: number }[]>(Prisma.sql`
        SELECT "id", "status"::text AS "status", "lockVersion" FROM "CommissionAccrual" WHERE "id" = ${input.commissionAccrualId}::uuid FOR UPDATE
      `);
      if (existing.length !== 1) throw new SalesCommissionNotFoundError("Commission accrual not found");
      const current = existing[0];
      if (current.lockVersion !== input.expectedLockVersion) throw new SalesCommissionConflictError();
      if (!TRANSITIONS[current.status].includes(input.toStatus)) throw new SalesCommissionValidationError(`Commission accrual cannot transition from ${current.status} to ${input.toStatus}`);
      const rows = await tx.$queryRaw<{ id: string; status: CommissionAccrualStatus; lockVersion: number }[]>(Prisma.sql`
        UPDATE "CommissionAccrual"
        SET "status" = ${input.toStatus}::"CommissionAccrualStatus",
            "earnedAt" = CASE WHEN ${input.toStatus} = 'EARNED' THEN CURRENT_TIMESTAMP ELSE "earnedAt" END,
            "approvedAt" = CASE WHEN ${input.toStatus} = 'APPROVED' THEN CURRENT_TIMESTAMP ELSE "approvedAt" END,
            "lockVersion" = "lockVersion" + 1,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.commissionAccrualId}::uuid AND "lockVersion" = ${input.expectedLockVersion}
        RETURNING "id", "status"::text AS "status", "lockVersion"
      `);
      if (rows.length !== 1) throw new SalesCommissionConflictError();
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "CommissionAccrualEvent" ("id", "commissionAccrualId", "fromStatus", "toStatus", "actorIdentityId", "actorMembershipId", "reason")
        VALUES (gen_random_uuid(), ${input.commissionAccrualId}::uuid, ${current.status}::"CommissionAccrualStatus", ${input.toStatus}::"CommissionAccrualStatus", ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid, ${input.reason})
      `);
      await audit(tx, context, "commission.accrual.transitioned", "CommissionAccrual", input.commissionAccrualId, input.reason, { fromStatus: current.status, toStatus: input.toStatus });
      return rows[0];
    });
  }

  async createAdjustment(
    context: PlatformAuthorizationContext,
    input: { commissionAccrualId: string; type: "ADJUSTMENT" | "REVERSAL"; amount: number; currency?: string; reason: string },
  ) {
    requirePlatformAuthorization(context, { permission: "platform.commission.manage" });
    validateReason(input.reason);
    if (!Number.isFinite(input.amount) || input.amount === 0) throw new SalesCommissionValidationError("Adjustment amount must be nonzero");
    return db.$transaction(async (tx) => {
      const accruals = await tx.$queryRaw<{ id: string; currency: string }[]>(Prisma.sql`SELECT "id", "currency" FROM "CommissionAccrual" WHERE "id" = ${input.commissionAccrualId}::uuid`);
      if (accruals.length !== 1) throw new SalesCommissionNotFoundError("Commission accrual not found");
      const currency = (input.currency ?? accruals[0].currency).toUpperCase();
      if (currency !== accruals[0].currency) throw new SalesCommissionValidationError("Adjustment currency must match the accrual currency");
      const amount = input.type === "REVERSAL" ? -Math.abs(input.amount) : input.amount;
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO "CommissionAdjustment" ("id", "commissionAccrualId", "type", "amount", "currency", "reason", "actorIdentityId", "actorMembershipId")
        VALUES (gen_random_uuid(), ${input.commissionAccrualId}::uuid, ${input.type}::"CommissionAdjustmentType", ${amount}, ${currency}, ${input.reason}, ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid)
        RETURNING "id"
      `);
      await audit(tx, context, "commission.adjustment.created", "CommissionAdjustment", rows[0].id, input.reason, { commissionAccrualId: input.commissionAccrualId, type: input.type });
      return rows[0];
    });
  }

  async recordPayment(
    context: PlatformAuthorizationContext,
    input: { commissionAccrualId: string; expectedLockVersion: number; paymentReference: string; paidAt: Date; reason: string },
  ) {
    requirePlatformAuthorization(context, { permission: "platform.commission.manage" });
    validateReason(input.reason);
    if (!input.paymentReference.trim() || Number.isNaN(input.paidAt.getTime())) throw new SalesCommissionValidationError("Valid payment reference and paid date are required");
    return db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{
        id: string;
        salesRepresentativeId: string;
        status: CommissionAccrualStatus;
        lockVersion: number;
        commissionAmount: Prisma.Decimal;
        currency: string;
        adjustmentTotal: Prisma.Decimal;
      }[]>(Prisma.sql`
        SELECT ca."id", ca."salesRepresentativeId", ca."status"::text AS "status", ca."lockVersion", ca."commissionAmount", ca."currency",
               COALESCE(SUM(adj."amount"), 0) AS "adjustmentTotal"
        FROM "CommissionAccrual" ca
        LEFT JOIN "CommissionAdjustment" adj ON adj."commissionAccrualId" = ca."id"
        WHERE ca."id" = ${input.commissionAccrualId}::uuid
        GROUP BY ca."id" FOR UPDATE OF ca
      `);
      if (rows.length !== 1) throw new SalesCommissionNotFoundError("Commission accrual not found");
      const accrual = rows[0];
      if (accrual.status !== "APPROVED") throw new SalesCommissionValidationError("Only approved commission accruals can be paid");
      if (accrual.lockVersion !== input.expectedLockVersion) throw new SalesCommissionConflictError();
      const totalAmount = Number(accrual.commissionAmount) + Number(accrual.adjustmentTotal);
      if (totalAmount < 0) throw new SalesCommissionValidationError("Net commission payment cannot be negative");
      const payments = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO "CommissionPayment" ("id", "salesRepresentativeId", "paymentReference", "paidAt", "currency", "totalAmount", "actorIdentityId", "actorMembershipId")
        VALUES (gen_random_uuid(), ${accrual.salesRepresentativeId}::uuid, ${input.paymentReference.trim()}, ${input.paidAt}, ${accrual.currency}, ${totalAmount}, ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid)
        RETURNING "id"
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "CommissionPaymentItem" ("commissionPaymentId", "commissionAccrualId", "amount")
        VALUES (${payments[0].id}::uuid, ${input.commissionAccrualId}::uuid, ${totalAmount})
      `);
      const updated = await tx.$queryRaw<{ id: string; status: CommissionAccrualStatus; lockVersion: number }[]>(Prisma.sql`
        UPDATE "CommissionAccrual"
        SET "status" = 'PAID', "paidAt" = ${input.paidAt}, "lockVersion" = "lockVersion" + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.commissionAccrualId}::uuid AND "status" = 'APPROVED' AND "lockVersion" = ${input.expectedLockVersion}
        RETURNING "id", "status"::text AS "status", "lockVersion"
      `);
      if (updated.length !== 1) throw new SalesCommissionConflictError();
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "CommissionAccrualEvent" ("id", "commissionAccrualId", "fromStatus", "toStatus", "actorIdentityId", "actorMembershipId", "reason")
        VALUES (gen_random_uuid(), ${input.commissionAccrualId}::uuid, 'APPROVED', 'PAID', ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid, ${input.reason})
      `);
      await audit(tx, context, "commission.payment.recorded", "CommissionPayment", payments[0].id, input.reason, { commissionAccrualId: input.commissionAccrualId, totalAmount });
      return { paymentId: payments[0].id, accrual: updated[0] };
    });
  }
}
