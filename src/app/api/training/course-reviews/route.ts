import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";

const reviewLookup = z.object({ reviewId: z.string().uuid() });
const inputSchema = z.object({ courseId: z.string().uuid(), expectedRevision: z.number().int().positive() }).strict();
type Review = { id: string; courseId: string; draftRevision: number; status: string; submittedAt: Date };
class ReviewConflict extends Error {}

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "training.manage" });
    if (request.nextUrl.searchParams.has("reviewId")) {
      const { reviewId } = reviewLookup.parse(Object.fromEntries(request.nextUrl.searchParams));
      const details = await db.$queryRaw<Array<Review & { submittedByUserId: string; content: unknown; currentRevision: number }>>(Prisma.sql`
        SELECT r."id", r."courseId", r."draftRevision", r."status", r."submittedAt",
          r."submittedByUserId", d."content", d."revision" AS "currentRevision"
        FROM "TrainingCourseReview" r
        INNER JOIN "TrainingCourseDraft" d ON d."organizationId" = r."organizationId" AND d."courseId" = r."courseId"
        WHERE r."organizationId" = ${context.organizationId}::uuid AND r."id" = ${reviewId}::uuid
      `);
      const review = details[0];
      if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });
      if (review.currentRevision !== review.draftRevision) return NextResponse.json({ error: "Submitted content is outdated. Request a new review submission." }, { status: 409 });
      return NextResponse.json({ data: review });
    }
    const rows = await db.$queryRaw<Review[]>(Prisma.sql`
      SELECT "id", "courseId", "draftRevision", "status", "submittedAt", "submittedByUserId"
      FROM "TrainingCourseReview" WHERE "organizationId" = ${context.organizationId}::uuid
      ORDER BY "submittedAt" DESC LIMIT 100
    `);
    return NextResponse.json({ data: rows });
  } catch (error) { return respond(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "training.manage" });
    const input = inputSchema.parse(await request.json());
    const review = await db.$transaction(async (tx) => {
      const drafts = await tx.$queryRaw<Array<{ revision: number; content: unknown }>>(Prisma.sql`
        SELECT d."revision", d."content" FROM "TrainingCourseDraft" d
        INNER JOIN "TrainingCourse" c ON c."id" = d."courseId" AND c."organizationId" = d."organizationId"
        WHERE d."organizationId" = ${context.organizationId}::uuid AND d."courseId" = ${input.courseId}::uuid FOR UPDATE OF d
      `);
      const draft = drafts[0];
      if (!draft || draft.revision !== input.expectedRevision) throw new ReviewConflict("Load the latest saved draft before submitting.");
      const content = draft.content as { lessons?: unknown[]; assessment?: { questions?: unknown[] } } | null;
      if (!Array.isArray(content?.lessons) || !content.lessons.length || !Array.isArray(content.assessment?.questions) || !content.assessment.questions.length) {
        throw new ReviewConflict("A course needs at least one saved lesson and one saved quiz question before review.");
      }
      const existing = await tx.$queryRaw<Review[]>(Prisma.sql`
        SELECT "id", "courseId", "draftRevision", "status", "submittedAt" FROM "TrainingCourseReview"
        WHERE "organizationId" = ${context.organizationId}::uuid AND "courseId" = ${input.courseId}::uuid AND "draftRevision" = ${draft.revision}
      `);
      if (existing.length) return existing[0];
      await tx.$executeRaw(Prisma.sql`
        UPDATE "TrainingCourseReview" SET "status" = 'SUPERSEDED'
        WHERE "organizationId" = ${context.organizationId}::uuid AND "courseId" = ${input.courseId}::uuid AND "status" = 'PENDING'
      `);
      const rows = await tx.$queryRaw<Review[]>(Prisma.sql`
        INSERT INTO "TrainingCourseReview" ("organizationId", "courseId", "draftRevision", "submittedByUserId")
        VALUES (${context.organizationId}::uuid, ${input.courseId}::uuid, ${draft.revision}, ${context.userId}::uuid)
        RETURNING "id", "courseId", "draftRevision", "status", "submittedAt"
      `);
      await tx.auditEvent.create({ data: { organizationId: context.organizationId, actorUserId: context.userId,
        action: "TRAINING_COURSE_REVIEW_SUBMITTED", entityType: "TrainingCourse", entityId: input.courseId,
        metadata: { draftRevision: draft.revision, reviewId: rows[0].id } } });
      return rows[0];
    });
    return NextResponse.json({ data: review }, { status: 201 });
  } catch (error) { return respond(error); }
}

function respond(error: unknown) {
  if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (error instanceof ReviewConflict) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid review submission" }, { status: 422 });
  if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
  return NextResponse.json({ error: "Training course review operation failed" }, { status: 500 });
}
