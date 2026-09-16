-- Sales & Commission Foundation
-- Additive Trace control-plane commercial domain. Tenant QMS tables and tenant RBAC are not altered.

CREATE TYPE "SalesRepresentativeStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "CommissionPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "CommissionPlanVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "CommissionRuleType" AS ENUM ('PERCENTAGE', 'FIXED');
CREATE TYPE "CommissionAccrualStatus" AS ENUM ('PENDING', 'EARNED', 'APPROVED', 'PAID');
CREATE TYPE "CommissionAdjustmentType" AS ENUM ('ADJUSTMENT', 'REVERSAL');

CREATE TABLE "SalesRepresentative" (
  "id" UUID NOT NULL,
  "platformIdentityId" UUID NOT NULL,
  "displayName" TEXT NOT NULL,
  "status" "SalesRepresentativeStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SalesRepresentative_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalesRepresentative_platformIdentityId_key" ON "SalesRepresentative"("platformIdentityId");
ALTER TABLE "SalesRepresentative" ADD CONSTRAINT "SalesRepresentative_platformIdentityId_fkey"
  FOREIGN KEY ("platformIdentityId") REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SalesAssignment" (
  "id" UUID NOT NULL,
  "salesRepresentativeId" UUID NOT NULL,
  "customerAccountId" UUID NOT NULL,
  "startsAt" TIMESTAMPTZ(3) NOT NULL,
  "endsAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesAssignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SalesAssignment_customer_idx" ON "SalesAssignment"("customerAccountId", "startsAt");
CREATE INDEX "SalesAssignment_rep_idx" ON "SalesAssignment"("salesRepresentativeId", "startsAt");
ALTER TABLE "SalesAssignment" ADD CONSTRAINT "SalesAssignment_salesRepresentativeId_fkey"
  FOREIGN KEY ("salesRepresentativeId") REFERENCES "SalesRepresentative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesAssignment" ADD CONSTRAINT "SalesAssignment_customerAccountId_fkey"
  FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CommissionPlan" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "CommissionPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CommissionPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommissionPlan_code_key" ON "CommissionPlan"("code");

CREATE TABLE "CommissionPlanVersion" (
  "id" UUID NOT NULL,
  "commissionPlanId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "CommissionPlanVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
  "effectiveTo" TIMESTAMPTZ(3),
  "activatedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommissionPlanVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommissionPlanVersion_plan_version_key" ON "CommissionPlanVersion"("commissionPlanId", "version");
ALTER TABLE "CommissionPlanVersion" ADD CONSTRAINT "CommissionPlanVersion_commissionPlanId_fkey"
  FOREIGN KEY ("commissionPlanId") REFERENCES "CommissionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CommissionRule" (
  "id" UUID NOT NULL,
  "commissionPlanVersionId" UUID NOT NULL,
  "ruleCode" TEXT NOT NULL,
  "ruleType" "CommissionRuleType" NOT NULL,
  "rate" NUMERIC(18,6),
  "fixedAmount" NUMERIC(18,2),
  "currency" CHAR(3) NOT NULL DEFAULT 'USD',
  "description" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommissionRule_value_check" CHECK (
    ("ruleType" = 'PERCENTAGE' AND "rate" IS NOT NULL AND "fixedAmount" IS NULL AND "rate" >= 0) OR
    ("ruleType" = 'FIXED' AND "fixedAmount" IS NOT NULL AND "rate" IS NULL AND "fixedAmount" >= 0)
  )
);
CREATE UNIQUE INDEX "CommissionRule_version_code_key" ON "CommissionRule"("commissionPlanVersionId", "ruleCode");
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_commissionPlanVersionId_fkey"
  FOREIGN KEY ("commissionPlanVersionId") REFERENCES "CommissionPlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CommissionAccrual" (
  "id" UUID NOT NULL,
  "salesRepresentativeId" UUID NOT NULL,
  "salesAssignmentId" UUID NOT NULL,
  "customerAccountId" UUID NOT NULL,
  "commissionPlanVersionId" UUID NOT NULL,
  "commissionRuleId" UUID NOT NULL,
  "status" "CommissionAccrualStatus" NOT NULL DEFAULT 'PENDING',
  "sourceType" TEXT NOT NULL,
  "sourceReference" TEXT NOT NULL,
  "basisAmount" NUMERIC(18,2) NOT NULL,
  "commissionAmount" NUMERIC(18,2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'USD',
  "ruleSnapshot" JSONB NOT NULL,
  "earnedAt" TIMESTAMPTZ(3),
  "approvedAt" TIMESTAMPTZ(3),
  "paidAt" TIMESTAMPTZ(3),
  "lockVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CommissionAccrual_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommissionAccrual_amount_check" CHECK ("basisAmount" >= 0 AND "commissionAmount" >= 0)
);
CREATE UNIQUE INDEX "CommissionAccrual_source_key" ON "CommissionAccrual"("sourceType", "sourceReference", "salesRepresentativeId");
CREATE INDEX "CommissionAccrual_rep_status_idx" ON "CommissionAccrual"("salesRepresentativeId", "status");
CREATE INDEX "CommissionAccrual_customer_idx" ON "CommissionAccrual"("customerAccountId", "createdAt");
ALTER TABLE "CommissionAccrual" ADD CONSTRAINT "CommissionAccrual_salesRepresentativeId_fkey" FOREIGN KEY ("salesRepresentativeId") REFERENCES "SalesRepresentative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionAccrual" ADD CONSTRAINT "CommissionAccrual_salesAssignmentId_fkey" FOREIGN KEY ("salesAssignmentId") REFERENCES "SalesAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionAccrual" ADD CONSTRAINT "CommissionAccrual_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionAccrual" ADD CONSTRAINT "CommissionAccrual_commissionPlanVersionId_fkey" FOREIGN KEY ("commissionPlanVersionId") REFERENCES "CommissionPlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionAccrual" ADD CONSTRAINT "CommissionAccrual_commissionRuleId_fkey" FOREIGN KEY ("commissionRuleId") REFERENCES "CommissionRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CommissionAccrualEvent" (
  "id" UUID NOT NULL,
  "commissionAccrualId" UUID NOT NULL,
  "fromStatus" "CommissionAccrualStatus",
  "toStatus" "CommissionAccrualStatus" NOT NULL,
  "actorIdentityId" UUID NOT NULL,
  "actorMembershipId" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestId" UUID,
  "correlationId" UUID,
  CONSTRAINT "CommissionAccrualEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CommissionAccrualEvent_accrual_idx" ON "CommissionAccrualEvent"("commissionAccrualId", "occurredAt");
ALTER TABLE "CommissionAccrualEvent" ADD CONSTRAINT "CommissionAccrualEvent_accrual_fkey" FOREIGN KEY ("commissionAccrualId") REFERENCES "CommissionAccrual"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionAccrualEvent" ADD CONSTRAINT "CommissionAccrualEvent_actorIdentity_fkey" FOREIGN KEY ("actorIdentityId") REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionAccrualEvent" ADD CONSTRAINT "CommissionAccrualEvent_actorMembership_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CommissionAdjustment" (
  "id" UUID NOT NULL,
  "commissionAccrualId" UUID NOT NULL,
  "type" "CommissionAdjustmentType" NOT NULL,
  "amount" NUMERIC(18,2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'USD',
  "reason" TEXT NOT NULL,
  "actorIdentityId" UUID NOT NULL,
  "actorMembershipId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommissionAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommissionAdjustment_nonzero_check" CHECK ("amount" <> 0)
);
CREATE INDEX "CommissionAdjustment_accrual_idx" ON "CommissionAdjustment"("commissionAccrualId", "createdAt");
ALTER TABLE "CommissionAdjustment" ADD CONSTRAINT "CommissionAdjustment_accrual_fkey" FOREIGN KEY ("commissionAccrualId") REFERENCES "CommissionAccrual"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionAdjustment" ADD CONSTRAINT "CommissionAdjustment_actorIdentity_fkey" FOREIGN KEY ("actorIdentityId") REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionAdjustment" ADD CONSTRAINT "CommissionAdjustment_actorMembership_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CommissionPayment" (
  "id" UUID NOT NULL,
  "salesRepresentativeId" UUID NOT NULL,
  "paymentReference" TEXT NOT NULL,
  "paidAt" TIMESTAMPTZ(3) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'USD',
  "totalAmount" NUMERIC(18,2) NOT NULL,
  "actorIdentityId" UUID NOT NULL,
  "actorMembershipId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommissionPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommissionPayment_amount_check" CHECK ("totalAmount" >= 0)
);
CREATE UNIQUE INDEX "CommissionPayment_reference_key" ON "CommissionPayment"("paymentReference");
ALTER TABLE "CommissionPayment" ADD CONSTRAINT "CommissionPayment_rep_fkey" FOREIGN KEY ("salesRepresentativeId") REFERENCES "SalesRepresentative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionPayment" ADD CONSTRAINT "CommissionPayment_actorIdentity_fkey" FOREIGN KEY ("actorIdentityId") REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionPayment" ADD CONSTRAINT "CommissionPayment_actorMembership_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CommissionPaymentItem" (
  "commissionPaymentId" UUID NOT NULL,
  "commissionAccrualId" UUID NOT NULL,
  "amount" NUMERIC(18,2) NOT NULL,
  CONSTRAINT "CommissionPaymentItem_pkey" PRIMARY KEY ("commissionPaymentId", "commissionAccrualId"),
  CONSTRAINT "CommissionPaymentItem_amount_check" CHECK ("amount" >= 0)
);
ALTER TABLE "CommissionPaymentItem" ADD CONSTRAINT "CommissionPaymentItem_payment_fkey" FOREIGN KEY ("commissionPaymentId") REFERENCES "CommissionPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionPaymentItem" ADD CONSTRAINT "CommissionPaymentItem_accrual_fkey" FOREIGN KEY ("commissionAccrualId") REFERENCES "CommissionAccrual"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Active commission plan versions and their rules are historical configuration.
CREATE FUNCTION prevent_active_commission_plan_version_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'ACTIVE' THEN RAISE EXCEPTION 'Active CommissionPlanVersion rows are immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "CommissionPlanVersion_active_immutable" BEFORE UPDATE OR DELETE ON "CommissionPlanVersion" FOR EACH ROW EXECUTE FUNCTION prevent_active_commission_plan_version_mutation();

CREATE FUNCTION prevent_active_commission_rule_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "CommissionPlanVersion" WHERE "id" = OLD."commissionPlanVersionId" AND "status" = 'ACTIVE') THEN
    RAISE EXCEPTION 'Rules for active CommissionPlanVersion rows are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "CommissionRule_active_version_immutable" BEFORE UPDATE OR DELETE ON "CommissionRule" FOR EACH ROW EXECUTE FUNCTION prevent_active_commission_rule_mutation();

-- History and monetary transaction records are append-only.
CREATE FUNCTION prevent_commission_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Commission history rows are append-only'; END;
$$;
CREATE TRIGGER "CommissionAccrualEvent_no_update_delete" BEFORE UPDATE OR DELETE ON "CommissionAccrualEvent" FOR EACH ROW EXECUTE FUNCTION prevent_commission_history_mutation();
CREATE TRIGGER "CommissionAdjustment_no_update_delete" BEFORE UPDATE OR DELETE ON "CommissionAdjustment" FOR EACH ROW EXECUTE FUNCTION prevent_commission_history_mutation();
CREATE TRIGGER "CommissionPayment_no_update_delete" BEFORE UPDATE OR DELETE ON "CommissionPayment" FOR EACH ROW EXECUTE FUNCTION prevent_commission_history_mutation();
CREATE TRIGGER "CommissionPaymentItem_no_update_delete" BEFORE UPDATE OR DELETE ON "CommissionPaymentItem" FOR EACH ROW EXECUTE FUNCTION prevent_commission_history_mutation();

-- Preserve historical calculation identity; only lifecycle fields may change on an accrual.
CREATE FUNCTION protect_commission_accrual_basis() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."salesRepresentativeId" <> NEW."salesRepresentativeId"
     OR OLD."salesAssignmentId" <> NEW."salesAssignmentId"
     OR OLD."customerAccountId" <> NEW."customerAccountId"
     OR OLD."commissionPlanVersionId" <> NEW."commissionPlanVersionId"
     OR OLD."commissionRuleId" <> NEW."commissionRuleId"
     OR OLD."sourceType" <> NEW."sourceType"
     OR OLD."sourceReference" <> NEW."sourceReference"
     OR OLD."basisAmount" <> NEW."basisAmount"
     OR OLD."commissionAmount" <> NEW."commissionAmount"
     OR OLD."currency" <> NEW."currency"
     OR OLD."ruleSnapshot" <> NEW."ruleSnapshot" THEN
    RAISE EXCEPTION 'Commission accrual calculation basis is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "CommissionAccrual_basis_immutable" BEFORE UPDATE ON "CommissionAccrual" FOR EACH ROW EXECUTE FUNCTION protect_commission_accrual_basis();