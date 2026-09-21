import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { PrivateObjectStorage } from "../storage/s3";
import type { PlatformAuthorizationContext } from "./authorization";
import { requirePlatformAuthorization } from "./authorization";
import { HelpContentNotFoundError, HelpContentValidationError } from "./help-content";
import { renderManualReleasePdf } from "./manual-pdf";

type ReleaseRow = {
  id: string; manualCode: string; manualName: string; version: string; status: string;
  effectiveAt: Date | null; publishedAt: Date | null; releaseNotes: string;
};
type SectionRow = {
  sectionRevisionId: string; sectionCode: string; title: string; revisionNumber: number; body: string; displayOrder: number;
};
type SnapshotRow = {
  id: string; releaseId: string; originalName: string; mimeType: string; sizeBytes: bigint; sha256: string;
  sectionRevisionIds: string[]; reason: string; createdAt: Date;
};

function requireReason(value: string) {
  const reason = value.trim();
  if (!reason) throw new HelpContentValidationError("A snapshot reason is required");
  if (reason.length > 1000) throw new HelpContentValidationError("Snapshot reason is too long");
  return reason;
}

async function audit(tx: Prisma.TransactionClient, context: PlatformAuthorizationContext, action: string, entityId: string, reason: string, metadata: Prisma.InputJsonObject) {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "PlatformAuditEvent" ("id","actorIdentityId","actorMembershipId","action","entityType","entityId","reason","metadata")
    VALUES (gen_random_uuid(), ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid,
      ${action}, 'UserManualReleaseSnapshot', ${entityId}::uuid, ${reason}, ${JSON.stringify(metadata)}::jsonb)
  `);
}

export class ManualReleaseSnapshotService {
  async list(context: PlatformAuthorizationContext, releaseId: string) {
    requirePlatformAuthorization(context, { permission: "platform.help.manage" });
    return db.$queryRaw<SnapshotRow[]>(Prisma.sql`
      SELECT "id","releaseId","originalName","mimeType","sizeBytes","sha256","sectionRevisionIds","reason","createdAt"
      FROM "UserManualReleaseSnapshot" WHERE "releaseId"=${releaseId}::uuid ORDER BY "createdAt" DESC
    `);
  }

  async create(context: PlatformAuthorizationContext, input: { releaseId: string; reason: string }) {
    requirePlatformAuthorization(context, { permission: "platform.help.manage" });
    const reason = requireReason(input.reason);
    const releases = await db.$queryRaw<ReleaseRow[]>(Prisma.sql`
      SELECT umr."id",um."code" AS "manualCode",um."name" AS "manualName",umr."version",
        umr."status"::text AS "status",umr."effectiveAt",umr."publishedAt",umr."releaseNotes"
      FROM "UserManualRelease" umr INNER JOIN "UserManual" um ON um."id"=umr."manualId"
      WHERE umr."id"=${input.releaseId}::uuid LIMIT 1
    `);
    if (releases.length !== 1) throw new HelpContentNotFoundError("Manual release not found");
    const sections = await db.$queryRaw<SectionRow[]>(Prisma.sql`
      SELECT usr."id" AS "sectionRevisionId",us."sectionCode",us."title",usr."revisionNumber",usr."body",umrs."displayOrder"
      FROM "UserManualReleaseSection" umrs
      INNER JOIN "UserManualSectionRevision" usr ON usr."id"=umrs."sectionRevisionId"
      INNER JOIN "UserManualSection" us ON us."id"=usr."sectionId"
      WHERE umrs."releaseId"=${input.releaseId}::uuid
      ORDER BY umrs."displayOrder",us."displayOrder"
    `);
    if (!sections.length) throw new HelpContentValidationError("Manual release has no frozen sections");
    const generatedAt = new Date();
    const bytes = renderManualReleasePdf({ ...releases[0], generatedAt, sections });
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const existing = await db.$queryRaw<SnapshotRow[]>(Prisma.sql`
      SELECT "id","releaseId","originalName","mimeType","sizeBytes","sha256","sectionRevisionIds","reason","createdAt"
      FROM "UserManualReleaseSnapshot" WHERE "releaseId"=${input.releaseId}::uuid AND "sha256"=${sha256} LIMIT 1
    `);
    if (existing.length === 1) return { snapshot: existing[0], created: false };

    const id = randomUUID();
    const originalName = `${releases[0].manualCode}-v${releases[0].version}-snapshot.pdf`.replace(/[^a-zA-Z0-9._-]/g, "-");
    const storageKey = `platform/manual-snapshots/${input.releaseId}/${id}.pdf`;
    const storage = new PrivateObjectStorage();
    await storage.put(storageKey, bytes, "application/pdf");
    try {
      const snapshot = await db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<SnapshotRow[]>(Prisma.sql`
          INSERT INTO "UserManualReleaseSnapshot" (
            "id","releaseId","storageKey","originalName","mimeType","sizeBytes","sha256","sectionRevisionIds",
            "generatedByIdentityId","generatedByMembershipId","reason"
          ) VALUES (
            ${id}::uuid,${input.releaseId}::uuid,${storageKey},${originalName},'application/pdf',${bytes.byteLength},
            ${sha256},${sections.map((section) => section.sectionRevisionId)}::uuid[],
            ${context.platformIdentityId}::uuid,${context.platformMembershipId}::uuid,${reason}
          )
          RETURNING "id","releaseId","originalName","mimeType","sizeBytes","sha256","sectionRevisionIds","reason","createdAt"
        `);
        await audit(tx, context, "manual.snapshot.created", id, reason, {
          releaseId: input.releaseId,
          manualCode: releases[0].manualCode,
          version: releases[0].version,
          releaseStatus: releases[0].status,
          sha256,
          sizeBytes: bytes.byteLength,
          sectionRevisionIds: sections.map((section) => section.sectionRevisionId),
        });
        return rows[0];
      });
      return { snapshot, created: true };
    } catch (error) {
      await storage.remove(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async download(context: PlatformAuthorizationContext, input: { releaseId: string; snapshotId: string }) {
    requirePlatformAuthorization(context, { permission: "platform.help.manage" });
    const rows = await db.$queryRaw<(SnapshotRow & { storageKey: string })[]>(Prisma.sql`
      SELECT "id","releaseId","storageKey","originalName","mimeType","sizeBytes","sha256","sectionRevisionIds","reason","createdAt"
      FROM "UserManualReleaseSnapshot"
      WHERE "id"=${input.snapshotId}::uuid AND "releaseId"=${input.releaseId}::uuid LIMIT 1
    `);
    if (rows.length !== 1) throw new HelpContentNotFoundError("Manual snapshot not found");
    const bytes = await new PrivateObjectStorage().get(rows[0].storageKey);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== rows[0].sha256) throw new HelpContentValidationError("Manual snapshot integrity check failed");
    await db.$transaction(async (tx) => {
      await audit(tx, context, "manual.snapshot.downloaded", rows[0].id, "Controlled snapshot download", {
        releaseId: rows[0].releaseId, sha256,
      });
    });
    return { snapshot: rows[0], bytes };
  }
}
