-- Records runtime readiness repair.
--
-- This migration is intentionally idempotent. It restores the governed Records
-- foundation if an environment has migration-history/schema drift while remaining
-- a no-op for environments where 0019_record_management_foundation and the later
-- record permission migrations are already fully applied.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QualityRecordStatus') THEN
    CREATE TYPE "QualityRecordStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "RecordType" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "RecordType" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE "RecordType" ADD COLUMN IF NOT EXISTS "organizationId" uuid;
ALTER TABLE "RecordType" ADD COLUMN IF NOT EXISTS "code" text;
ALTER TABLE "RecordType" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE "RecordType" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "RecordType" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true;
ALTER TABLE "RecordType" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "RecordType" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz(3) DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecordType_pkey') THEN
    ALTER TABLE "RecordType" ADD CONSTRAINT "RecordType_pkey" PRIMARY KEY ("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecordType_organizationId_fkey') THEN
    ALTER TABLE "RecordType" ADD CONSTRAINT "RecordType_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecordType_organizationId_id_key') THEN
    ALTER TABLE "RecordType" ADD CONSTRAINT "RecordType_organizationId_id_key" UNIQUE ("organizationId", "id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecordType_organizationId_code_key') THEN
    ALTER TABLE "RecordType" ADD CONSTRAINT "RecordType_organizationId_code_key" UNIQUE ("organizationId", "code");
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "QualityRecord" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL,
  "recordTypeId" uuid NOT NULL,
  "recordNumber" text NOT NULL,
  "title" text NOT NULL,
  "status" "QualityRecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "occurredAt" timestamptz(3),
  "fileId" uuid,
  "createdByUserId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "QualityRecord" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE "QualityRecord" ADD COLUMN IF NOT EXISTS "organizationId" uuid;
ALTER TABLE "QualityRecord" ADD COLUMN IF NOT EXISTS "recordTypeId" uuid;
ALTER TABLE "QualityRecord" ADD COLUMN IF NOT EXISTS "recordNumber" text;
ALTER TABLE "QualityRecord" ADD COLUMN IF NOT EXISTS "title" text;
ALTER TABLE "QualityRecord" ADD COLUMN IF NOT EXISTS "status" "QualityRecordStatus" DEFAULT 'ACTIVE';
ALTER TABLE "QualityRecord" ADD COLUMN IF NOT EXISTS "occurredAt" timestamptz(3);
ALTER TABLE "QualityRecord" ADD COLUMN IF NOT EXISTS "fileId" uuid;
ALTER TABLE "QualityRecord" ADD COLUMN IF NOT EXISTS "createdByUserId" uuid;
ALTER TABLE "QualityRecord" ADD COLUMN IF NOT EXISTS "createdAt" timestamptz(3) DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QualityRecord_pkey') THEN
    ALTER TABLE "QualityRecord" ADD CONSTRAINT "QualityRecord_pkey" PRIMARY KEY ("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QualityRecord_organizationId_fkey') THEN
    ALTER TABLE "QualityRecord" ADD CONSTRAINT "QualityRecord_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QualityRecord_organizationId_id_key') THEN
    ALTER TABLE "QualityRecord" ADD CONSTRAINT "QualityRecord_organizationId_id_key" UNIQUE ("organizationId", "id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QualityRecord_organizationId_recordNumber_key') THEN
    ALTER TABLE "QualityRecord" ADD CONSTRAINT "QualityRecord_organizationId_recordNumber_key" UNIQUE ("organizationId", "recordNumber");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QualityRecord_recordType_fkey') THEN
    ALTER TABLE "QualityRecord" ADD CONSTRAINT "QualityRecord_recordType_fkey"
      FOREIGN KEY ("organizationId", "recordTypeId") REFERENCES "RecordType"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QualityRecord_file_fkey') THEN
    ALTER TABLE "QualityRecord" ADD CONSTRAINT "QualityRecord_file_fkey"
      FOREIGN KEY ("organizationId", "fileId") REFERENCES "FileObject"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QualityRecord_creator_fkey') THEN
    ALTER TABLE "QualityRecord" ADD CONSTRAINT "QualityRecord_creator_fkey"
      FOREIGN KEY ("organizationId", "createdByUserId") REFERENCES "User"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "QualityRecord_organizationId_recordTypeId_createdAt_idx"
  ON "QualityRecord"("organizationId", "recordTypeId", "createdAt");
CREATE INDEX IF NOT EXISTS "QualityRecord_organizationId_status_createdAt_idx"
  ON "QualityRecord"("organizationId", "status", "createdAt");

INSERT INTO "Permission" ("id", "key", "description")
VALUES
  (gen_random_uuid(), 'record.read', 'View regulated quality records'),
  (gen_random_uuid(), 'record.create', 'Create regulated quality records'),
  (gen_random_uuid(), 'record.archive', 'Archive regulated quality records after retention evaluation'),
  (gen_random_uuid(), 'record.export', 'Export governed regulated records')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."systemRole" = true
  AND r."name" = 'System Administrator'
  AND p."key" IN ('record.read', 'record.create', 'record.archive', 'record.export')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
