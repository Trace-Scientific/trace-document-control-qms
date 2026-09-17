import { Prisma } from "@prisma/client";
import { db } from "../db";
import type { PlatformAuthorizationContext } from "./authorization";
import { requirePlatformAuthorization } from "./authorization";

export class HelpContentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HelpContentValidationError";
  }
}

export class HelpContentNotFoundError extends Error {
  constructor(message = "Help content not found") {
    super(message);
    this.name = "HelpContentNotFoundError";
  }
}

export class HelpContentConflictError extends Error {
  constructor(message = "Help content changed; refresh and retry") {
    super(message);
    this.name = "HelpContentConflictError";
  }
}

function requireReason(reason: string) {
  if (!reason.trim()) throw new HelpContentValidationError("A reason is required");
}

function requireText(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new HelpContentValidationError(`${label} is required`);
  return normalized;
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

type PublishedHelpArticleRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  categoryCode: string;
  categoryName: string;
  revisionNumber: number;
  body: string;
  changeSummary: string;
  publishedAt: Date;
};

export class HelpContentService {
  async searchPublishedArticles(query = "") {
    const term = query.trim();
    return db.$queryRaw(Prisma.sql`
      SELECT ha."id", ha."slug", ha."title", ha."summary", hc."code" AS "categoryCode", hc."name" AS "categoryName",
             har."revisionNumber", ha."publishedAt"
      FROM "HelpArticle" ha
      INNER JOIN "HelpCategory" hc ON hc."id" = ha."categoryId"
      INNER JOIN "HelpArticleRevision" har ON har."id" = ha."publishedRevisionId"
      WHERE ha."status" = 'PUBLISHED'
        AND (${term} = '' OR ha."title" ILIKE ${`%${term}%`} OR ha."summary" ILIKE ${`%${term}%`} OR har."body" ILIKE ${`%${term}%`})
      ORDER BY hc."displayOrder", ha."title"
      LIMIT 100
    `);
  }

  async getPublishedArticle(slug: string) {
    const rows = await db.$queryRaw<PublishedHelpArticleRow[]>(Prisma.sql`
      SELECT ha."id", ha."slug", ha."title", ha."summary", hc."code" AS "categoryCode", hc."name" AS "categoryName",
             har."revisionNumber", har."body", har."changeSummary", ha."publishedAt"
      FROM "HelpArticle" ha
      INNER JOIN "HelpCategory" hc ON hc."id" = ha."categoryId"
      INNER JOIN "HelpArticleRevision" har ON har."id" = ha."publishedRevisionId"
      WHERE ha."slug" = ${slug} AND ha."status" = 'PUBLISHED'
      LIMIT 1
    `);
    if (rows.length !== 1) throw new HelpContentNotFoundError("Published help article not found");
    return rows[0];
  }

  async createCategory(context: PlatformAuthorizationContext, input: { code: string; name: string; description?: string | null; displayOrder?: number; reason: string }) {
    requirePlatformAuthorization(context, { permission: "platform.help.manage" });
    requireReason(input.reason);
    const code = requireText(input.code, "Category code");
    const name = requireText(input.name, "Category name");
    return db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO "HelpCategory" ("id", "code", "name", "description", "displayOrder", "updatedAt")
        VALUES (gen_random_uuid(), ${code}, ${name}, ${input.description ?? null}, ${input.displayOrder ?? 0}, CURRENT_TIMESTAMP)
        RETURNING "id"
      `);
      await audit(tx, context, "help.category.created", "HelpCategory", rows[0].id, input.reason);
      return rows[0];
    });
  }

  async createArticle(context: PlatformAuthorizationContext, input: { categoryId: string; slug: string; title: string; summary: string; body: string; changeSummary: string; reason: string }) {
    requirePlatformAuthorization(context, { permission: "platform.help.manage" });
    requireReason(input.reason);
    const slug = requireText(input.slug, "Article slug");
    const title = requireText(input.title, "Article title");
    const summary = requireText(input.summary, "Article summary");
    const body = requireText(input.body, "Article body");
    const changeSummary = requireText(input.changeSummary, "Change summary");
    return db.$transaction(async (tx) => {
      const categories = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT "id" FROM "HelpCategory" WHERE "id" = ${input.categoryId}::uuid`);
      if (categories.length !== 1) throw new HelpContentValidationError("Help category does not exist");
      const articles = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO "HelpArticle" ("id", "categoryId", "slug", "title", "summary", "updatedAt")
        VALUES (gen_random_uuid(), ${input.categoryId}::uuid, ${slug}, ${title}, ${summary}, CURRENT_TIMESTAMP)
        RETURNING "id"
      `);
      const revisions = await tx.$queryRaw<{ id: string; revisionNumber: number }[]>(Prisma.sql`
        INSERT INTO "HelpArticleRevision" ("id", "articleId", "revisionNumber", "body", "changeSummary", "createdByIdentityId", "createdByMembershipId")
        VALUES (gen_random_uuid(), ${articles[0].id}::uuid, 1, ${body}, ${changeSummary}, ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid)
        RETURNING "id", "revisionNumber"
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "HelpArticleEvent" ("id", "articleId", "revisionId", "action", "actorIdentityId", "actorMembershipId", "reason")
        VALUES (gen_random_uuid(), ${articles[0].id}::uuid, ${revisions[0].id}::uuid, 'CREATED', ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid, ${input.reason})
      `);
      await audit(tx, context, "help.article.created", "HelpArticle", articles[0].id, input.reason, { revisionNumber: 1 });
      return { ...articles[0], revision: revisions[0] };
    });
  }

  async addArticleRevision(context: PlatformAuthorizationContext, input: { articleId: string; body: string; changeSummary: string; expectedLockVersion: number; reason: string }) {
    requirePlatformAuthorization(context, { permission: "platform.help.manage" });
    requireReason(input.reason);
    const body = requireText(input.body, "Article body");
    const changeSummary = requireText(input.changeSummary, "Change summary");
    return db.$transaction(async (tx) => {
      const articles = await tx.$queryRaw<{ id: string; status: string; lockVersion: number }[]>(Prisma.sql`
        SELECT "id", "status"::text AS "status", "lockVersion" FROM "HelpArticle" WHERE "id" = ${input.articleId}::uuid FOR UPDATE
      `);
      if (articles.length !== 1) throw new HelpContentNotFoundError("Help article not found");
      if (articles[0].status === "ARCHIVED") throw new HelpContentValidationError("Archived help articles cannot receive new revisions");
      if (articles[0].lockVersion !== input.expectedLockVersion) throw new HelpContentConflictError();
      const next = await tx.$queryRaw<{ revisionNumber: number }[]>(Prisma.sql`
        SELECT COALESCE(MAX("revisionNumber"), 0) + 1 AS "revisionNumber" FROM "HelpArticleRevision" WHERE "articleId" = ${input.articleId}::uuid
      `);
      const revisions = await tx.$queryRaw<{ id: string; revisionNumber: number }[]>(Prisma.sql`
        INSERT INTO "HelpArticleRevision" ("id", "articleId", "revisionNumber", "body", "changeSummary", "createdByIdentityId", "createdByMembershipId")
        VALUES (gen_random_uuid(), ${input.articleId}::uuid, ${next[0].revisionNumber}, ${body}, ${changeSummary}, ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid)
        RETURNING "id", "revisionNumber"
      `);
      await tx.$executeRaw(Prisma.sql`UPDATE "HelpArticle" SET "lockVersion" = "lockVersion" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${input.articleId}::uuid`);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "HelpArticleEvent" ("id", "articleId", "revisionId", "action", "actorIdentityId", "actorMembershipId", "reason")
        VALUES (gen_random_uuid(), ${input.articleId}::uuid, ${revisions[0].id}::uuid, 'REVISION_CREATED', ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid, ${input.reason})
      `);
      await audit(tx, context, "help.article.revision_created", "HelpArticle", input.articleId, input.reason, { revisionNumber: revisions[0].revisionNumber });
      return revisions[0];
    });
  }

  async publishArticleRevision(context: PlatformAuthorizationContext, input: { articleId: string; revisionId: string; expectedLockVersion: number; reason: string }) {
    requirePlatformAuthorization(context, { permission: "platform.help.manage" });
    requireReason(input.reason);
    return db.$transaction(async (tx) => {
      const articles = await tx.$queryRaw<{ id: string; status: string; lockVersion: number }[]>(Prisma.sql`
        SELECT "id", "status"::text AS "status", "lockVersion" FROM "HelpArticle" WHERE "id" = ${input.articleId}::uuid FOR UPDATE
      `);
      if (articles.length !== 1) throw new HelpContentNotFoundError("Help article not found");
      if (articles[0].status === "ARCHIVED") throw new HelpContentValidationError("Archived help articles cannot be published");
      if (articles[0].lockVersion !== input.expectedLockVersion) throw new HelpContentConflictError();
      const revisions = await tx.$queryRaw<{ id: string; revisionNumber: number }[]>(Prisma.sql`
        SELECT "id", "revisionNumber" FROM "HelpArticleRevision" WHERE "id" = ${input.revisionId}::uuid AND "articleId" = ${input.articleId}::uuid
      `);
      if (revisions.length !== 1) throw new HelpContentValidationError("Revision does not belong to the help article");
      const updated = await tx.$queryRaw<{ id: string; status: string; lockVersion: number }[]>(Prisma.sql`
        UPDATE "HelpArticle"
        SET "status" = 'PUBLISHED', "publishedRevisionId" = ${input.revisionId}::uuid, "publishedAt" = CURRENT_TIMESTAMP,
            "lockVersion" = "lockVersion" + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.articleId}::uuid AND "lockVersion" = ${input.expectedLockVersion}
        RETURNING "id", "status"::text AS "status", "lockVersion"
      `);
      if (updated.length !== 1) throw new HelpContentConflictError();
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "HelpArticleEvent" ("id", "articleId", "revisionId", "action", "actorIdentityId", "actorMembershipId", "reason")
        VALUES (gen_random_uuid(), ${input.articleId}::uuid, ${input.revisionId}::uuid, 'PUBLISHED', ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid, ${input.reason})
      `);
      await audit(tx, context, "help.article.published", "HelpArticle", input.articleId, input.reason, { revisionNumber: revisions[0].revisionNumber });
      return updated[0];
    });
  }

  async archiveArticle(context: PlatformAuthorizationContext, input: { articleId: string; expectedLockVersion: number; reason: string }) {
    requirePlatformAuthorization(context, { permission: "platform.help.manage" });
    requireReason(input.reason);
    return db.$transaction(async (tx) => {
      const updated = await tx.$queryRaw<{ id: string; status: string; lockVersion: number }[]>(Prisma.sql`
        UPDATE "HelpArticle"
        SET "status" = 'ARCHIVED', "archivedAt" = CURRENT_TIMESTAMP, "lockVersion" = "lockVersion" + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.articleId}::uuid AND "status" <> 'ARCHIVED' AND "lockVersion" = ${input.expectedLockVersion}
        RETURNING "id", "status"::text AS "status", "lockVersion"
      `);
      if (updated.length !== 1) throw new HelpContentConflictError("Help article cannot be archived or changed; refresh and retry");
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "HelpArticleEvent" ("id", "articleId", "action", "actorIdentityId", "actorMembershipId", "reason")
        VALUES (gen_random_uuid(), ${input.articleId}::uuid, 'ARCHIVED', ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid, ${input.reason})
      `);
      await audit(tx, context, "help.article.archived", "HelpArticle", input.articleId, input.reason);
      return updated[0];
    });
  }

  async createManual(context: PlatformAuthorizationContext, input: { code: string; name: string; description?: string | null; reason: string }) {
    requirePlatformAuthorization(context, { permission: "platform.help.manage" });
    requireReason(input.reason);
    const code = requireText(input.code, "Manual code");
    const name = requireText(input.name, "Manual name");
    return db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO "UserManual" ("id", "code", "name", "description", "updatedAt")
        VALUES (gen_random_uuid(), ${code}, ${name}, ${input.description ?? null}, CURRENT_TIMESTAMP) RETURNING "id"
      `);
      await audit(tx, context, "manual.created", "UserManual", rows[0].id, input.reason);
      return rows[0];
    });
  }

  async createManualSection(context: PlatformAuthorizationContext, input: { manualId: string; sectionCode: string; title: string; displayOrder?: number; reason: string }) {
    requirePlatformAuthorization(context, { permission: "platform.help.manage" });
    requireReason(input.reason);
    return db.$transaction(async (tx) => {
      const manuals = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT "id" FROM "UserManual" WHERE "id" = ${input.manualId}::uuid`);
      if (manuals.length !== 1) throw new HelpContentValidationError("User manual does not exist");
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO "UserManualSection" ("id", "manualId", "sectionCode", "title", "displayOrder")
        VALUES (gen_random_uuid(), ${input.manualId}::uuid, ${requireText(input.sectionCode, "Section code")}, ${requireText(input.title, "Section title")}, ${input.displayOrder ?? 0}) RETURNING "id"
      `);
      await audit(tx, context, "manual.section.created", "UserManualSection", rows[0].id, input.reason, { manualId: input.manualId });
      return rows[0];
    });
  }

  async addManualSectionRevision(context: PlatformAuthorizationContext, input: { sectionId: string; body: string; changeSummary: string; reason: string }) {
    requirePlatformAuthorization(context, { permission: "platform.help.manage" });
    requireReason(input.reason);
    return db.$transaction(async (tx) => {
      const sections = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT "id" FROM "UserManualSection" WHERE "id" = ${input.sectionId}::uuid`);
      if (sections.length !== 1) throw new HelpContentNotFoundError("Manual section not found");
      const next = await tx.$queryRaw<{ revisionNumber: number }[]>(Prisma.sql`
        SELECT COALESCE(MAX("revisionNumber"), 0) + 1 AS "revisionNumber" FROM "UserManualSectionRevision" WHERE "sectionId" = ${input.sectionId}::uuid
      `);
      const rows = await tx.$queryRaw<{ id: string; revisionNumber: number }[]>(Prisma.sql`
        INSERT INTO "UserManualSectionRevision" ("id", "sectionId", "revisionNumber", "body", "changeSummary", "createdByIdentityId", "createdByMembershipId")
        VALUES (gen_random_uuid(), ${input.sectionId}::uuid, ${next[0].revisionNumber}, ${requireText(input.body, "Section body")}, ${requireText(input.changeSummary, "Change summary")}, ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid)
        RETURNING "id", "revisionNumber"
      `);
      await audit(tx, context, "manual.section_revision.created", "UserManualSectionRevision", rows[0].id, input.reason, { sectionId: input.sectionId, revisionNumber: rows[0].revisionNumber });
      return rows[0];
    });
  }

  async createManualRelease(context: PlatformAuthorizationContext, input: { manualId: string; version: string; effectiveAt: Date; releaseApplicability?: Prisma.InputJsonObject; releaseNotes: string; reason: string }) {
    requirePlatformAuthorization(context, { permission: "platform.help.manage" });
    requireReason(input.reason);
    if (Number.isNaN(input.effectiveAt.getTime())) throw new HelpContentValidationError("A valid effective date is required");
    return db.$transaction(async (tx) => {
      const manuals = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT "id" FROM "UserManual" WHERE "id" = ${input.manualId}::uuid`);
      if (manuals.length !== 1) throw new HelpContentValidationError("User manual does not exist");
      const rows = await tx.$queryRaw<{ id: string; lockVersion: number }[]>(Prisma.sql`
        INSERT INTO "UserManualRelease" ("id", "manualId", "version", "effectiveAt", "releaseApplicability", "releaseNotes", "updatedAt")
        VALUES (gen_random_uuid(), ${input.manualId}::uuid, ${requireText(input.version, "Manual version")}, ${input.effectiveAt}, ${JSON.stringify(input.releaseApplicability ?? {})}::jsonb, ${requireText(input.releaseNotes, "Release notes")}, CURRENT_TIMESTAMP)
        RETURNING "id", "lockVersion"
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "UserManualReleaseEvent" ("id", "releaseId", "action", "actorIdentityId", "actorMembershipId", "reason")
        VALUES (gen_random_uuid(), ${rows[0].id}::uuid, 'CREATED', ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid, ${input.reason})
      `);
      await audit(tx, context, "manual.release.created", "UserManualRelease", rows[0].id, input.reason, { version: input.version });
      return rows[0];
    });
  }

  async setManualReleaseSections(context: PlatformAuthorizationContext, input: { releaseId: string; sectionRevisionIds: string[]; expectedLockVersion: number; reason: string }) {
    requirePlatformAuthorization(context, { permission: "platform.help.manage" });
    requireReason(input.reason);
    if (input.sectionRevisionIds.length === 0) throw new HelpContentValidationError("At least one manual section revision is required");
    return db.$transaction(async (tx) => {
      const releases = await tx.$queryRaw<{ id: string; manualId: string; status: string; lockVersion: number }[]>(Prisma.sql`
        SELECT "id", "manualId", "status"::text AS "status", "lockVersion" FROM "UserManualRelease" WHERE "id" = ${input.releaseId}::uuid FOR UPDATE
      `);
      if (releases.length !== 1) throw new HelpContentNotFoundError("Manual release not found");
      if (releases[0].status !== "DRAFT") throw new HelpContentValidationError("Only draft manual releases can change sections");
      if (releases[0].lockVersion !== input.expectedLockVersion) throw new HelpContentConflictError();
      const revisions = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT usr."id" FROM "UserManualSectionRevision" usr
        INNER JOIN "UserManualSection" us ON us."id" = usr."sectionId"
        WHERE usr."id" = ANY(${input.sectionRevisionIds}::uuid[]) AND us."manualId" = ${releases[0].manualId}::uuid
      `);
      if (revisions.length !== input.sectionRevisionIds.length) throw new HelpContentValidationError("All release sections must belong to the same user manual");
      await tx.$executeRaw(Prisma.sql`DELETE FROM "UserManualReleaseSection" WHERE "releaseId" = ${input.releaseId}::uuid`);
      for (let index = 0; index < input.sectionRevisionIds.length; index += 1) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "UserManualReleaseSection" ("releaseId", "sectionRevisionId", "displayOrder")
          VALUES (${input.releaseId}::uuid, ${input.sectionRevisionIds[index]}::uuid, ${index})
        `);
      }
      const updated = await tx.$queryRaw<{ id: string; lockVersion: number }[]>(Prisma.sql`
        UPDATE "UserManualRelease" SET "lockVersion" = "lockVersion" + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.releaseId}::uuid AND "lockVersion" = ${input.expectedLockVersion}
        RETURNING "id", "lockVersion"
      `);
      if (updated.length !== 1) throw new HelpContentConflictError();
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "UserManualReleaseEvent" ("id", "releaseId", "action", "actorIdentityId", "actorMembershipId", "reason")
        VALUES (gen_random_uuid(), ${input.releaseId}::uuid, 'SECTIONS_SET', ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid, ${input.reason})
      `);
      await audit(tx, context, "manual.release.sections_set", "UserManualRelease", input.releaseId, input.reason, { sectionCount: input.sectionRevisionIds.length });
      return updated[0];
    });
  }

  async publishManualRelease(context: PlatformAuthorizationContext, input: { releaseId: string; expectedLockVersion: number; reason: string }) {
    requirePlatformAuthorization(context, { permission: "platform.help.manage" });
    requireReason(input.reason);
    return db.$transaction(async (tx) => {
      const releases = await tx.$queryRaw<{ id: string; status: string; lockVersion: number; sectionCount: bigint }[]>(Prisma.sql`
        SELECT umr."id", umr."status"::text AS "status", umr."lockVersion", COUNT(umrs."sectionRevisionId") AS "sectionCount"
        FROM "UserManualRelease" umr LEFT JOIN "UserManualReleaseSection" umrs ON umrs."releaseId" = umr."id"
        WHERE umr."id" = ${input.releaseId}::uuid GROUP BY umr."id" FOR UPDATE OF umr
      `);
      if (releases.length !== 1) throw new HelpContentNotFoundError("Manual release not found");
      if (releases[0].status !== "DRAFT") throw new HelpContentValidationError("Only draft manual releases can be published");
      if (releases[0].lockVersion !== input.expectedLockVersion) throw new HelpContentConflictError();
      if (Number(releases[0].sectionCount) < 1) throw new HelpContentValidationError("A manual release must contain at least one section");
      const updated = await tx.$queryRaw<{ id: string; status: string; lockVersion: number }[]>(Prisma.sql`
        UPDATE "UserManualRelease"
        SET "status" = 'PUBLISHED', "publishedAt" = CURRENT_TIMESTAMP, "lockVersion" = "lockVersion" + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.releaseId}::uuid AND "status" = 'DRAFT' AND "lockVersion" = ${input.expectedLockVersion}
        RETURNING "id", "status"::text AS "status", "lockVersion"
      `);
      if (updated.length !== 1) throw new HelpContentConflictError();
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "UserManualReleaseEvent" ("id", "releaseId", "action", "actorIdentityId", "actorMembershipId", "reason")
        VALUES (gen_random_uuid(), ${input.releaseId}::uuid, 'PUBLISHED', ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid, ${input.reason})
      `);
      await audit(tx, context, "manual.release.published", "UserManualRelease", input.releaseId, input.reason);
      return updated[0];
    });
  }

  async archiveManualRelease(context: PlatformAuthorizationContext, input: { releaseId: string; expectedLockVersion: number; reason: string }) {
    requirePlatformAuthorization(context, { permission: "platform.help.manage" });
    requireReason(input.reason);
    return db.$transaction(async (tx) => {
      const updated = await tx.$queryRaw<{ id: string; status: string; lockVersion: number }[]>(Prisma.sql`
        UPDATE "UserManualRelease"
        SET "status" = 'ARCHIVED', "archivedAt" = CURRENT_TIMESTAMP, "lockVersion" = "lockVersion" + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.releaseId}::uuid AND "status" = 'PUBLISHED' AND "lockVersion" = ${input.expectedLockVersion}
        RETURNING "id", "status"::text AS "status", "lockVersion"
      `);
      if (updated.length !== 1) throw new HelpContentConflictError("Only the expected published release can be archived");
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "UserManualReleaseEvent" ("id", "releaseId", "action", "actorIdentityId", "actorMembershipId", "reason")
        VALUES (gen_random_uuid(), ${input.releaseId}::uuid, 'ARCHIVED', ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid, ${input.reason})
      `);
      await audit(tx, context, "manual.release.archived", "UserManualRelease", input.releaseId, input.reason);
      return updated[0];
    });
  }

  async listPublishedManualReleases() {
    return db.$queryRaw(Prisma.sql`
      SELECT um."code" AS "manualCode", um."name" AS "manualName", umr."version", umr."effectiveAt", umr."releaseApplicability", umr."releaseNotes", umr."publishedAt"
      FROM "UserManualRelease" umr INNER JOIN "UserManual" um ON um."id" = umr."manualId"
      WHERE umr."status" = 'PUBLISHED'
      ORDER BY um."name", umr."effectiveAt" DESC
    `);
  }

  async getPublishedManualRelease(manualCode: string, version: string) {
    const releases = await db.$queryRaw<{ id: string; manualCode: string; manualName: string; version: string; effectiveAt: Date; releaseApplicability: unknown; releaseNotes: string; publishedAt: Date }[]>(Prisma.sql`
      SELECT umr."id", um."code" AS "manualCode", um."name" AS "manualName", umr."version", umr."effectiveAt", umr."releaseApplicability", umr."releaseNotes", umr."publishedAt"
      FROM "UserManualRelease" umr INNER JOIN "UserManual" um ON um."id" = umr."manualId"
      WHERE um."code" = ${manualCode} AND umr."version" = ${version} AND umr."status" = 'PUBLISHED' LIMIT 1
    `);
    if (releases.length !== 1) throw new HelpContentNotFoundError("Published manual release not found");
    const sections = await db.$queryRaw(Prisma.sql`
      SELECT us."sectionCode", us."title", usr."revisionNumber", usr."body", usr."changeSummary", umrs."displayOrder"
      FROM "UserManualReleaseSection" umrs
      INNER JOIN "UserManualSectionRevision" usr ON usr."id" = umrs."sectionRevisionId"
      INNER JOIN "UserManualSection" us ON us."id" = usr."sectionId"
      WHERE umrs."releaseId" = ${releases[0].id}::uuid ORDER BY umrs."displayOrder", us."displayOrder"
    `);
    return { ...releases[0], sections };
  }
}
