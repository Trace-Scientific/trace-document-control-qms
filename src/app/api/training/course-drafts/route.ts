import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";

const uuid = z.string().uuid();
const lesson = z.object({ heading: z.string().trim().min(1).max(160), content: z.string().trim().min(1).max(10000) }).strict();
const question = z.object({
  prompt: z.string().trim().min(1).max(500),
  choices: z.tuple([z.string().trim().min(1).max(300), z.string().trim().min(1).max(300), z.string().trim().min(1).max(300), z.string().trim().min(1).max(300)]),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().max(1000),
}).strict().refine((q) => new Set(q.choices.map((x) => x.toLowerCase())).size === 4, "Answers must be distinct");
const draft = z.object({
  format: z.literal("trace-qms-course-draft-v2"),
  status: z.literal("LOCAL_DRAFT_NOT_PUBLISHED"),
  lessons: z.array(lesson).max(100),
  assessment: z.object({ passingScorePercent: z.number().int().min(1).max(100), questions: z.array(question).max(100) }).strict(),
}).strict();
const save = z.object({ courseId: uuid, expectedRevision: z.number().int().min(0), draft }).strict();
const lookup = z.object({ courseId: uuid });

type Stored = { id: string; courseId: string; revision: number; content: unknown; updatedAt: Date };
class RevisionConflict extends Error {}

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "training.manage" });
    const { courseId } = lookup.parse(Object.fromEntries(request.nextUrl.searchParams));
    const rows = await db.$queryRaw<Stored[]>(Prisma.sql`
      SELECT "id", "courseId", "revision", "content", "updatedAt" FROM "TrainingCourseDraft"
      WHERE "organizationId" = ${context.organizationId}::uuid AND "courseId" = ${courseId}::uuid
    `);
    return NextResponse.json({ data: rows[0] ?? null });
  } catch (error) { return respond(error); }
}

export async function PUT(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "training.manage" });
    const raw = await request.text();
    if (raw.length > 250_000) return NextResponse.json({ error: "Draft exceeds size limit" }, { status: 413 });
    const input = save.parse(JSON.parse(raw));
    const stored = await db.$transaction(async (tx) => {
      const course = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "TrainingCourse" WHERE "organizationId" = ${context.organizationId}::uuid AND "id" = ${input.courseId}::uuid FOR UPDATE
      `);
      if (!course.length) return null;
      const existing = await tx.$queryRaw<Stored[]>(Prisma.sql`
        SELECT "id", "courseId", "revision", "content", "updatedAt" FROM "TrainingCourseDraft"
        WHERE "organizationId" = ${context.organizationId}::uuid AND "courseId" = ${input.courseId}::uuid FOR UPDATE
      `);
      const current = existing[0];
      if ((current?.revision ?? 0) !== input.expectedRevision) throw new RevisionConflict();
      const payload = JSON.stringify(input.draft);
      const rows = current
        ? await tx.$queryRaw<Stored[]>(Prisma.sql`
          UPDATE "TrainingCourseDraft" SET "content" = ${payload}::jsonb, "revision" = "revision" + 1,
            "updatedByUserId" = ${context.userId}::uuid, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "organizationId" = ${context.organizationId}::uuid AND "courseId" = ${input.courseId}::uuid
          RETURNING "id", "courseId", "revision", "content", "updatedAt"
        `)
        : await tx.$queryRaw<Stored[]>(Prisma.sql`
          INSERT INTO "TrainingCourseDraft" ("organizationId", "courseId", "content", "updatedByUserId")
          VALUES (${context.organizationId}::uuid, ${input.courseId}::uuid, ${payload}::jsonb, ${context.userId}::uuid)
          RETURNING "id", "courseId", "revision", "content", "updatedAt"
        `);
      await tx.auditEvent.create({ data: { organizationId: context.organizationId, actorUserId: context.userId,
        action: "TRAINING_COURSE_DRAFT_SAVED", entityType: "TrainingCourse", entityId: input.courseId,
        metadata: { revision: rows[0].revision, lessonCount: input.draft.lessons.length, questionCount: input.draft.assessment.questions.length } } });
      return rows[0];
    });
    if (!stored) return NextResponse.json({ error: "Course not found in this organization" }, { status: 404 });
    return NextResponse.json({ data: stored });
  } catch (error) { return respond(error); }
}

function respond(error: unknown) {
  if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (error instanceof RevisionConflict) return NextResponse.json({ error: "Draft changed since you loaded it. Reload before saving." }, { status: 409 });
  if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid training draft request" }, { status: 422 });
  if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
  return NextResponse.json({ error: "Training draft operation failed" }, { status: 500 });
}
