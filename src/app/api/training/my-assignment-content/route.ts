import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { resolveOwnTrainingAssignments } from "@/lib/training/employee-training";

// Employee-only view of the immutable version pinned to an assignment.
// Identity is derived only from the session-bound employee link.
const querySchema = z.object({ assignmentId: z.string().uuid() }).strict();
type AssignmentPublication = { assignmentId: string; courseId: string; version: number; publicationId: string; content: unknown };
type Content = { lessons: Array<{ heading: string; content: string }>; assessment: { passingScorePercent: number; questions: Array<{ prompt: string; choices: string[] }> } };

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const employees = await db.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
      SELECT e."id", e."status"::text AS "status"
      FROM "TrainingEmployeeUserLink" l
      JOIN "Employee" e ON e."organizationId" = l."organizationId" AND e."id" = l."employeeId"
      WHERE l."organizationId" = ${context.organizationId}::uuid AND l."userId" = ${context.userId}::uuid
    `);
    const employee = resolveOwnTrainingAssignments(context, employees);
    const { assignmentId } = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const rows = await db.$queryRaw<AssignmentPublication[]>(Prisma.sql`
      SELECT a."id" AS "assignmentId", a."courseId", p."version", p."id" AS "publicationId", p."content"
      FROM "TrainingAssignment" a
      INNER JOIN "TrainingCoursePublishedVersion" p
        ON p."organizationId" = a."organizationId" AND p."id" = a."publishedVersionId"
        AND p."courseId" = a."courseId"
      WHERE a."organizationId" = ${context.organizationId}::uuid AND a."employeeId" = ${employee.id}::uuid AND a."status"::text = 'ASSIGNED' AND a."id" = ${assignmentId}::uuid
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) return NextResponse.json({ error: "No pinned published version for this assignment" }, { status: 404 });
    const content = row.content as Partial<Content> | null;
    if (!Array.isArray(content?.lessons) || !Array.isArray(content?.assessment?.questions)) {
      return NextResponse.json({ error: "Published assignment content is invalid" }, { status: 409 });
    }
    // Only learner-safe fields. Never serialize correctIndex, explanations or authoring data.
    return NextResponse.json({ data: {
      assignmentId: row.assignmentId, courseId: row.courseId, publicationId: row.publicationId, version: row.version,
      lessons: content.lessons.map((lesson) => ({ heading: lesson.heading, content: lesson.content })),
      assessment: {
        passingScorePercent: content.assessment.passingScorePercent,
        questions: content.assessment.questions.map((question) => ({ prompt: question.prompt, choices: question.choices })),
      },
    } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid assignment request" }, { status: 422 });
    if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json({ error: "Unable to load assignment publication" }, { status: 500 });
  }
}
