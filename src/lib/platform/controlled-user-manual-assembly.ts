import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePlatformAuthorization, type PlatformAuthorizationContext } from "@/lib/platform/authorization";
import { CONTROLLED_USER_MANUAL } from "@/lib/platform/controlled-user-manual";
import { CONTROLLED_USER_MANUAL_DRAFTS } from "@/lib/platform/controlled-user-manual-drafts";
import { HelpContentConflictError, HelpContentValidationError } from "@/lib/platform/help-content";

const INITIAL_DRAFT_VERSION = "0.1";

async function writeAudit(
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
      "id","actorIdentityId","actorMembershipId","action","entityType","entityId","reason","metadata"
    ) VALUES (
      gen_random_uuid(), ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid,
      ${action}, ${entityType}, ${entityId}::uuid, ${reason}, ${JSON.stringify(metadata)}::jsonb
    )
  `);
}

export class ControlledUserManualAssemblyService {
  async assembleReviewedDraft(context: PlatformAuthorizationContext, reason: string) {
    requirePlatformAuthorization(context, { permission: "platform.help.manage" });
    if (!reason.trim()) throw new HelpContentValidationError("A reason is required");

    return db.$transaction(async (tx) => {
      const existingManuals = await tx.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
        SELECT "id","name" FROM "UserManual" WHERE "code"=${CONTROLLED_USER_MANUAL.code} FOR UPDATE
      `);

      let manualId: string;
      let manualCreated = false;
      if (existingManuals[0]) {
        if (existingManuals[0].name !== CONTROLLED_USER_MANUAL.name) {
          throw new HelpContentConflictError("UM-QMS-001 exists with an unexpected name; reconcile before assembly");
        }
        manualId = existingManuals[0].id;
      } else {
        const created = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO "UserManual" ("id","code","name","description","updatedAt")
          VALUES (
            gen_random_uuid(),
            ${CONTROLLED_USER_MANUAL.code},
            ${CONTROLLED_USER_MANUAL.name},
            ${CONTROLLED_USER_MANUAL.description},
            CURRENT_TIMESTAMP
          )
          RETURNING "id"
        `);
        manualId = created[0].id;
        manualCreated = true;
      }

      const revisionIds: string[] = [];
      let sectionsCreated = 0;
      let revisionsCreated = 0;

      for (let index = 0; index < CONTROLLED_USER_MANUAL_DRAFTS.length; index += 1) {
        const draft = CONTROLLED_USER_MANUAL_DRAFTS[index];
        const sectionRows = await tx.$queryRaw<Array<{ id: string; title: string; displayOrder: number }>>(Prisma.sql`
          SELECT "id","title","displayOrder"
          FROM "UserManualSection"
          WHERE "manualId"=${manualId}::uuid AND "sectionCode"=${draft.sectionCode}
          FOR UPDATE
        `);

        let sectionId: string;
        if (sectionRows[0]) {
          if (sectionRows[0].title !== draft.title) {
            throw new HelpContentConflictError(`Section ${draft.sectionCode} exists with an unexpected title; reconcile before assembly`);
          }
          sectionId = sectionRows[0].id;
        } else {
          const createdSection = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            INSERT INTO "UserManualSection" ("id","manualId","sectionCode","title","displayOrder")
            VALUES (gen_random_uuid(), ${manualId}::uuid, ${draft.sectionCode}, ${draft.title}, ${index})
            RETURNING "id"
          `);
          sectionId = createdSection[0].id;
          sectionsCreated += 1;
        }

        const identical = await tx.$queryRaw<Array<{ id: string; revisionNumber: number }>>(Prisma.sql`
          SELECT "id","revisionNumber"
          FROM "UserManualSectionRevision"
          WHERE "sectionId"=${sectionId}::uuid
            AND "body"=${draft.body}
            AND "changeSummary"=${draft.changeSummary}
          ORDER BY "revisionNumber" DESC
          LIMIT 1
        `);

        if (identical[0]) {
          revisionIds.push(identical[0].id);
        } else {
          const nextRows = await tx.$queryRaw<Array<{ revisionNumber: number }>>(Prisma.sql`
            SELECT COALESCE(MAX("revisionNumber"),0)+1 AS "revisionNumber"
            FROM "UserManualSectionRevision"
            WHERE "sectionId"=${sectionId}::uuid
          `);
          const createdRevision = await tx.$queryRaw<Array<{ id: string; revisionNumber: number }>>(Prisma.sql`
            INSERT INTO "UserManualSectionRevision" (
              "id","sectionId","revisionNumber","body","changeSummary","createdByIdentityId","createdByMembershipId"
            ) VALUES (
              gen_random_uuid(), ${sectionId}::uuid, ${nextRows[0].revisionNumber},
              ${draft.body}, ${draft.changeSummary},
              ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid
            )
            RETURNING "id","revisionNumber"
          `);
          revisionIds.push(createdRevision[0].id);
          revisionsCreated += 1;
        }
      }

      const releaseRows = await tx.$queryRaw<Array<{ id: string; status: string; lockVersion: number }>>(Prisma.sql`
        SELECT "id","status"::text AS "status","lockVersion"
        FROM "UserManualRelease"
        WHERE "manualId"=${manualId}::uuid AND "version"=${INITIAL_DRAFT_VERSION}
        FOR UPDATE
      `);

      let releaseId: string;
      let releaseCreated = false;
      if (releaseRows[0]) {
        if (releaseRows[0].status !== "DRAFT") {
          throw new HelpContentConflictError("UM-QMS-001 version 0.1 is no longer DRAFT; create a new controlled release instead");
        }
        releaseId = releaseRows[0].id;
      } else {
        const createdRelease = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO "UserManualRelease" (
            "id","manualId","version","status","effectiveAt","releaseApplicability","releaseNotes","updatedAt"
          ) VALUES (
            gen_random_uuid(), ${manualId}::uuid, ${INITIAL_DRAFT_VERSION}, 'DRAFT', NULL,
            ${JSON.stringify({ stage: "launch-candidate", source: "reviewed-source-drafts" })}::jsonb,
            'Initial controlled draft assembled from the reviewed UM-QMS-001 launch content. Not published or effective.',
            CURRENT_TIMESTAMP
          )
          RETURNING "id"
        `);
        releaseId = createdRelease[0].id;
        releaseCreated = true;

        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "UserManualReleaseEvent" (
            "id","releaseId","action","actorIdentityId","actorMembershipId","reason"
          ) VALUES (
            gen_random_uuid(), ${releaseId}::uuid, 'CREATED',
            ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid, ${reason}
          )
        `);
      }

      const currentSectionRows = await tx.$queryRaw<Array<{ sectionRevisionId: string }>>(Prisma.sql`
        SELECT "sectionRevisionId"
        FROM "UserManualReleaseSection"
        WHERE "releaseId"=${releaseId}::uuid
        ORDER BY "displayOrder"
      `);
      const currentIds = currentSectionRows.map((row) => row.sectionRevisionId);
      const sectionsAlreadyExact =
        currentIds.length === revisionIds.length &&
        currentIds.every((id, index) => id === revisionIds[index]);

      if (!sectionsAlreadyExact) {
        await tx.$executeRaw(Prisma.sql`DELETE FROM "UserManualReleaseSection" WHERE "releaseId"=${releaseId}::uuid`);
        for (let index = 0; index < revisionIds.length; index += 1) {
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO "UserManualReleaseSection" ("releaseId","sectionRevisionId","displayOrder")
            VALUES (${releaseId}::uuid,${revisionIds[index]}::uuid,${index})
          `);
        }
        await tx.$executeRaw(Prisma.sql`
          UPDATE "UserManualRelease"
          SET "lockVersion"="lockVersion"+1,"updatedAt"=CURRENT_TIMESTAMP
          WHERE "id"=${releaseId}::uuid
        `);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "UserManualReleaseEvent" (
            "id","releaseId","action","actorIdentityId","actorMembershipId","reason"
          ) VALUES (
            gen_random_uuid(), ${releaseId}::uuid, 'SECTIONS_SET',
            ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid, ${reason}
          )
        `);
      }

      await writeAudit(tx, context, "manual.reviewed_draft.assembled", "UserManualRelease", releaseId, reason, {
        manualCode: CONTROLLED_USER_MANUAL.code,
        version: INITIAL_DRAFT_VERSION,
        sectionCount: revisionIds.length,
        manualCreated,
        sectionsCreated,
        revisionsCreated,
        releaseCreated,
        sectionsChanged: !sectionsAlreadyExact,
        publicationState: "DRAFT",
        effectiveAt: null,
      });

      return {
        manualId,
        releaseId,
        version: INITIAL_DRAFT_VERSION,
        status: "DRAFT" as const,
        effectiveAt: null,
        sectionCount: revisionIds.length,
        manualCreated,
        sectionsCreated,
        revisionsCreated,
        releaseCreated,
        sectionsChanged: !sectionsAlreadyExact,
      };
    });
  }
}
