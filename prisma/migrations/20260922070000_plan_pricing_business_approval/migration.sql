-- Explicit business approval evidence for activation of priced plan versions.
ALTER TABLE "PlanVersion"
  ADD COLUMN "businessApprovedAt" TIMESTAMPTZ(3),
  ADD COLUMN "businessApprovedByIdentityId" UUID REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT,
  ADD COLUMN "businessApprovedByMembershipId" UUID REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT,
  ADD COLUMN "businessApprovalReason" TEXT;

ALTER TABLE "PlanVersion"
  ADD CONSTRAINT "PlanVersion_business_approval_complete_check" CHECK (
    ("businessApprovedAt" IS NULL AND "businessApprovedByIdentityId" IS NULL AND "businessApprovedByMembershipId" IS NULL AND "businessApprovalReason" IS NULL)
    OR
    ("businessApprovedAt" IS NOT NULL AND "businessApprovedByIdentityId" IS NOT NULL AND "businessApprovedByMembershipId" IS NOT NULL AND length(trim("businessApprovalReason")) > 0)
  );

CREATE FUNCTION prevent_plan_version_business_approval_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."businessApprovedAt" IS NOT NULL AND (
    OLD."businessApprovedAt" IS DISTINCT FROM NEW."businessApprovedAt"
    OR OLD."businessApprovedByIdentityId" IS DISTINCT FROM NEW."businessApprovedByIdentityId"
    OR OLD."businessApprovedByMembershipId" IS DISTINCT FROM NEW."businessApprovedByMembershipId"
    OR OLD."businessApprovalReason" IS DISTINCT FROM NEW."businessApprovalReason"
  ) THEN
    RAISE EXCEPTION 'Plan version business approval evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PlanVersion_business_approval_immutable"
BEFORE UPDATE ON "PlanVersion"
FOR EACH ROW EXECUTE FUNCTION prevent_plan_version_business_approval_mutation();
