import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";

const schema = z.object({ reviewId: z.string().uuid(), decision: z.enum(["APPROVE", "REJECT"]), reason: z.string().trim().max(1000).optional() }).strict()
  .refine((v) => v.decision !== "REJECT" || !!v.reason, "Rejection requires a reason");
class DecisionConflict extends Error {}
type Review = { id: string; courseId: string; draftRevision: number; submittedByUserId: string; status: string };
type Draft = { revision: number; content: unknown };
type Published = { id: string; courseId: string; version: number; publishedAt: Date };

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "training.read" });
    const rows = await db.$queryRaw<Published[]>(Prisma.sql`
      SELECT "id", "courseId", "version", "publishedAt" FROM "TrainingCoursePublishedVersion"
      WHERE "organizationId" = ${context.organizationId}::uuid ORDER BY "publishedAt" DESC LIMIT 100
    `);
    return NextResponse.json({ data: rows });
  } catch (error) { return respond(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "training.manage" });
    const input = schema.parse(await request.json());
    const result = await db.$transaction(async (tx) => {
      const reviews = await tx.$queryRaw<Review[]>(Prisma.sql`
        SELECT "id", "courseId", "draftRevision", "submittedByUserId", "status" FROM "TrainingCourseReview"
        WHERE "organizationId" = ${context.organizationId}::uuid AND "id" = ${input.reviewId}::uuid FOR UPDATE
      `);
      const review = reviews[0];
      if (!review || review.status !== "PENDING") throw new DecisionConflict("Only pending reviews can be decided.");
      if (review.submittedByUserId === context.userId) throw new DecisionConflict("A course submitter cannot approve or reject their own review.");
      const drafts = await tx.$queryRaw<Draft[]>(Prisma.sql`
        SELECT "revision", "content" FROM "TrainingCourseDraft"
        WHERE "organizationId" = ${context.organizationId}::uuid AND "courseId" = ${review.courseId}::uuid FOR UPDATE
      `);
      const draft = drafts[0];
      if (!draft || draft.revision !== review.draftRevision) throw new DecisionConflict("Draft has changed. Submit the current revision for review.");
      await tx.$executeRaw(Prisma.sql`
        UPDATE "TrainingCourseReview" SET "status" = ${input.decision === "APPROVE" ? "APPROVED" : "REJECTED"},
          "decidedByUserId" = ${context.userId}::uuid, "decidedAt" = CURRENT_TIMESTAMP,
          "decisionReason" = ${input.reason ?? null}
        WHERE "organizationId" = ${context.organizationId}::uuid AND "id" = ${review.id}::uuid
      `);
      let publication: Published | null = null;
      if (input.decision === "APPROVE") {
        const versions = await tx.$queryRaw<Array<{ version: number }>>(Prisma.sql`
          SELECT "version" FROM "TrainingCoursePublishedVersion"
          WHERE "organizationId" = ${context.organizationId}::uuid AND "courseId" = ${review.courseId}::uuid
          ORDER BY "version" DESC LIMIT 1
        `);
        const nextVersion = (versions[0]?.version ?? 0) + 1;
        const rows = await tx.$queryRaw<Published[]>(Prisma.sql`
          INSERT INTO "TrainingCoursePublishedVersion" ("organizationId", "courseId", "version", "reviewId", "content", "publishedByUserId")
          VALUES (${context.organizationId}::uuid, ${review.courseId}::uuid, ${nextVersion}, ${review.id}::uuid, ${JSON.stringify(draft.content)}::jsonb, ${context.userId}::uuid)
          RETURNING "id", "courseId", "version", "publishedAt"
        `);
        publication = rows[0];
      }
      await tx.auditEvent.create({ data: { organizationId: context.organizationId, actorUserId: context.userId,
        action: input.decision === "APPROVE" ? "TRAINING_COURSE_VERSION_PUBLISHED" : "TRAINING_COURSE_REVIEW_REJECTED",
        entityType: "TrainingCourse", entityId: review.courseId,
        metadata: { reviewId: review.id, draftRevision: review.draftRevision, publishedVersion: publication?.version ?? null, reason: input.reason ?? null } } });
      return { decision: input.decision, reviewId: review.id, publication };
    });
    return NextResponse.json({ data: result });
  } catch (error) { return respond(error); }
}
function respond(error: unknown) {
  if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (error instanceof DecisionConflict) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid course review decision" }, { status: 422 });
  if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
  return NextResponse.json({ error: "Training course publication failed" }, { status: 500 });
}
