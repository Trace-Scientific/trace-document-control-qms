-- Platform Security & Data Foundation
-- Additive control-plane schema. Existing tenant tables are not altered.

CREATE TYPE "PlatformPrincipalStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED', 'PENDING');

CREATE TABLE "PlatformIdentity" (
  "id" UUID NOT NULL,
  "sourceUserId" UUID NOT NULL,
  "status" "PlatformPrincipalStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PlatformIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformIdentity_sourceUserId_key" ON "PlatformIdentity"("sourceUserId");
CREATE INDEX "PlatformIdentity_status_idx" ON "PlatformIdentity"("status");

ALTER TABLE "PlatformIdentity"
  ADD CONSTRAINT "PlatformIdentity_sourceUserId_fkey"
  FOREIGN KEY ("sourceUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PlatformMembership" (
  "id" UUID NOT NULL,
  "identityId" UUID NOT NULL,
  "status" "PlatformPrincipalStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PlatformMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformMembership_identityId_key" ON "PlatformMembership"("identityId");
CREATE INDEX "PlatformMembership_status_idx" ON "PlatformMembership"("status");

ALTER TABLE "PlatformMembership"
  ADD CONSTRAINT "PlatformMembership_identityId_fkey"
  FOREIGN KEY ("identityId") REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PlatformRole" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "systemRole" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PlatformRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformRole_name_key" ON "PlatformRole"("name");

CREATE TABLE "PlatformPermission" (
  "id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "description" TEXT,
  CONSTRAINT "PlatformPermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformPermission_key_key" ON "PlatformPermission"("key");

CREATE TABLE "PlatformMembershipRole" (
  "membershipId" UUID NOT NULL,
  "roleId" UUID NOT NULL,
  "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedByMembershipId" UUID,
  CONSTRAINT "PlatformMembershipRole_pkey" PRIMARY KEY ("membershipId", "roleId")
);

CREATE INDEX "PlatformMembershipRole_roleId_idx" ON "PlatformMembershipRole"("roleId");

ALTER TABLE "PlatformMembershipRole"
  ADD CONSTRAINT "PlatformMembershipRole_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "PlatformMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformMembershipRole"
  ADD CONSTRAINT "PlatformMembershipRole_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "PlatformRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformMembershipRole"
  ADD CONSTRAINT "PlatformMembershipRole_assignedByMembershipId_fkey"
  FOREIGN KEY ("assignedByMembershipId") REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PlatformRolePermission" (
  "roleId" UUID NOT NULL,
  "permissionId" UUID NOT NULL,
  CONSTRAINT "PlatformRolePermission_pkey" PRIMARY KEY ("roleId", "permissionId")
);

ALTER TABLE "PlatformRolePermission"
  ADD CONSTRAINT "PlatformRolePermission_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "PlatformRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformRolePermission"
  ADD CONSTRAINT "PlatformRolePermission_permissionId_fkey"
  FOREIGN KEY ("permissionId") REFERENCES "PlatformPermission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PlatformAuditEvent" (
  "id" UUID NOT NULL,
  "actorIdentityId" UUID,
  "actorMembershipId" UUID,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" UUID,
  "entityVersion" TEXT,
  "previousHash" TEXT,
  "newHash" TEXT,
  "correlationId" UUID,
  "requestId" UUID,
  "reason" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "PlatformAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformAuditEvent_occurredAt_idx" ON "PlatformAuditEvent"("occurredAt");
CREATE INDEX "PlatformAuditEvent_entityType_entityId_idx" ON "PlatformAuditEvent"("entityType", "entityId");
CREATE INDEX "PlatformAuditEvent_correlationId_idx" ON "PlatformAuditEvent"("correlationId");
CREATE INDEX "PlatformAuditEvent_actorMembershipId_idx" ON "PlatformAuditEvent"("actorMembershipId");

ALTER TABLE "PlatformAuditEvent"
  ADD CONSTRAINT "PlatformAuditEvent_actorIdentityId_fkey"
  FOREIGN KEY ("actorIdentityId") REFERENCES "PlatformIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlatformAuditEvent"
  ADD CONSTRAINT "PlatformAuditEvent_actorMembershipId_fkey"
  FOREIGN KEY ("actorMembershipId") REFERENCES "PlatformMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed stable permission keys. Role bundles are intentionally not seeded here.
INSERT INTO "PlatformPermission" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'platform.organization.read', 'View customer organization administration data.'),
  (gen_random_uuid(), 'platform.organization.manage', 'Manage customer organization administration data.'),
  (gen_random_uuid(), 'platform.organization.suspend', 'Suspend or restore customer organization commercial access.'),
  (gen_random_uuid(), 'platform.subscription.read', 'View subscriptions and plan assignments.'),
  (gen_random_uuid(), 'platform.subscription.manage', 'Manage subscriptions and plan assignments.'),
  (gen_random_uuid(), 'platform.entitlement.manage', 'Manage customer feature entitlements and approved overrides.'),
  (gen_random_uuid(), 'platform.support.request', 'Request controlled support access to a customer tenant.'),
  (gen_random_uuid(), 'platform.support.approve', 'Approve or deny controlled support access requests.'),
  (gen_random_uuid(), 'platform.support.access', 'Use an approved controlled support-access session.'),
  (gen_random_uuid(), 'platform.sales.read', 'View sales assignments and attribution.'),
  (gen_random_uuid(), 'platform.sales.manage', 'Manage sales assignments and attribution.'),
  (gen_random_uuid(), 'platform.commission.read', 'View commission records and status.'),
  (gen_random_uuid(), 'platform.commission.manage', 'Manage governed commission records and adjustments.'),
  (gen_random_uuid(), 'platform.audit.read', 'Read the platform audit trail.'),
  (gen_random_uuid(), 'platform.help.manage', 'Manage Help Center and controlled manual content.'),
  (gen_random_uuid(), 'platform.health.read', 'View sanitized platform operational health.'),
  (gen_random_uuid(), 'platform.integration.manage', 'Manage platform integration configuration.'),
  (gen_random_uuid(), 'platform.security.manage', 'Manage platform roles, permissions, and memberships.')
ON CONFLICT ("key") DO NOTHING;

-- Platform audit history is append-only at the database boundary.
CREATE FUNCTION prevent_platform_audit_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'PlatformAuditEvent rows are append-only';
END;
$$;

CREATE TRIGGER "PlatformAuditEvent_no_update_delete"
BEFORE UPDATE OR DELETE ON "PlatformAuditEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_platform_audit_event_mutation();
