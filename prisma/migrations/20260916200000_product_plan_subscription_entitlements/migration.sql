-- Product, Plan, Subscription & Entitlement Foundation
-- Additive control-plane commercial catalog and entitlement layer.
-- Tenant RBAC tables are intentionally not altered.

CREATE TYPE "CatalogRecordStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "EntitlementOverrideDecision" AS ENUM ('ENABLE', 'DISABLE');

CREATE TABLE "Product" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "CatalogRecordStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

CREATE TABLE "Feature" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "CatalogRecordStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Feature_key_key" ON "Feature"("key");
CREATE INDEX "Feature_product_status_idx" ON "Feature"("productId", "status");
ALTER TABLE "Feature" ADD CONSTRAINT "Feature_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Plan" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "CatalogRecordStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");
CREATE INDEX "Plan_product_status_idx" ON "Plan"("productId", "status");
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PlanVersion" (
  "id" UUID NOT NULL,
  "planId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "CatalogRecordStatus" NOT NULL DEFAULT 'DRAFT',
  "effectiveFrom" TIMESTAMPTZ(3),
  "effectiveTo" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMPTZ(3),
  CONSTRAINT "PlanVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlanVersion_effective_window_check" CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveTo" > "effectiveFrom")
);
CREATE UNIQUE INDEX "PlanVersion_plan_version_key" ON "PlanVersion"("planId", "version");
CREATE INDEX "PlanVersion_plan_status_idx" ON "PlanVersion"("planId", "status");
ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PlanFeature" (
  "planVersionId" UUID NOT NULL,
  "featureId" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "PlanFeature_pkey" PRIMARY KEY ("planVersionId", "featureId")
);
ALTER TABLE "PlanFeature" ADD CONSTRAINT "PlanFeature_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "PlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlanFeature" ADD CONSTRAINT "PlanFeature_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Subscription" (
  "id" UUID NOT NULL,
  "customerAccountId" UUID NOT NULL,
  "planVersionId" UUID NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "startsAt" TIMESTAMPTZ(3) NOT NULL,
  "endsAt" TIMESTAMPTZ(3),
  "lockVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Subscription_window_check" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt")
);
CREATE INDEX "Subscription_customer_status_idx" ON "Subscription"("customerAccountId", "status");
CREATE INDEX "Subscription_plan_status_idx" ON "Subscription"("planVersionId", "status");
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "PlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SubscriptionChange" (
  "id" UUID NOT NULL,
  "subscriptionId" UUID NOT NULL,
  "fromStatus" "SubscriptionStatus",
  "toStatus" "SubscriptionStatus" NOT NULL,
  "fromPlanVersionId" UUID,
  "toPlanVersionId" UUID NOT NULL,
  "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorIdentityId" UUID NOT NULL,
  "actorMembershipId" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "SubscriptionChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SubscriptionChange_subscription_changed_idx" ON "SubscriptionChange"("subscriptionId", "changedAt");
ALTER TABLE "SubscriptionChange" ADD CONSTRAINT "SubscriptionChange_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionChange" ADD CONSTRAINT "SubscriptionChange_fromPlanVersionId_fkey" FOREIGN KEY ("fromPlanVersionId") REFERENCES "PlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionChange" ADD CONSTRAINT "SubscriptionChange_toPlanVersionId_fkey" FOREIGN KEY ("toPlanVersionId") REFERENCES "PlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionChange" ADD CONSTRAINT "SubscriptionChange_actorIdentityId_fkey" FOREIGN KEY ("actorIdentityId") REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionChange" ADD CONSTRAINT "SubscriptionChange_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "EntitlementOverride" (
  "id" UUID NOT NULL,
  "customerAccountId" UUID NOT NULL,
  "featureId" UUID NOT NULL,
  "decision" "EntitlementOverrideDecision" NOT NULL,
  "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
  "effectiveTo" TIMESTAMPTZ(3),
  "reason" TEXT NOT NULL,
  "createdByIdentityId" UUID NOT NULL,
  "createdByMembershipId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMPTZ(3),
  "revokedByIdentityId" UUID,
  "revocationReason" TEXT,
  CONSTRAINT "EntitlementOverride_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EntitlementOverride_window_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom")
);
CREATE INDEX "EntitlementOverride_customer_feature_idx" ON "EntitlementOverride"("customerAccountId", "featureId", "effectiveFrom");
ALTER TABLE "EntitlementOverride" ADD CONSTRAINT "EntitlementOverride_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EntitlementOverride" ADD CONSTRAINT "EntitlementOverride_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EntitlementOverride" ADD CONSTRAINT "EntitlementOverride_createdByIdentityId_fkey" FOREIGN KEY ("createdByIdentityId") REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EntitlementOverride" ADD CONSTRAINT "EntitlementOverride_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EntitlementOverride" ADD CONSTRAINT "EntitlementOverride_revokedByIdentityId_fkey" FOREIGN KEY ("revokedByIdentityId") REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Historical subscription changes are immutable.
CREATE FUNCTION prevent_subscription_change_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'SubscriptionChange rows are append-only';
END;
$$;
CREATE TRIGGER "SubscriptionChange_no_update_delete"
BEFORE UPDATE OR DELETE ON "SubscriptionChange"
FOR EACH ROW EXECUTE FUNCTION prevent_subscription_change_mutation();

-- Activated plan versions and their feature matrix are immutable; create a new version instead.
CREATE FUNCTION prevent_active_plan_version_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'ACTIVE' THEN
    RAISE EXCEPTION 'Active PlanVersion rows are immutable; create a new version';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "PlanVersion_active_no_update_delete"
BEFORE UPDATE OR DELETE ON "PlanVersion"
FOR EACH ROW EXECUTE FUNCTION prevent_active_plan_version_mutation();

CREATE FUNCTION prevent_active_plan_feature_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "PlanVersion" pv WHERE pv."id" = OLD."planVersionId" AND pv."status" = 'ACTIVE') THEN
    RAISE EXCEPTION 'Features for an active PlanVersion are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER "PlanFeature_active_no_update_delete"
BEFORE UPDATE OR DELETE ON "PlanFeature"
FOR EACH ROW EXECUTE FUNCTION prevent_active_plan_feature_mutation();