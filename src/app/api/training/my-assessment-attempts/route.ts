import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { resolveOwnTrainingAssignments } from "@/lib/training/employee-training";
import { gradeTrainingAssessment } from "@/lib/training/assessment-grading";

const inputSchema = z.object({
  assignmentId: z.string().uuid(),
  answers: z.array(z.number().int().nonnegative()).min(1).max(200),
}).strict();
type LockedAssignment = {
  id: string; employeeId: string; courseId: string; publishedVersionId: string;
  status: string; content: unknown;
};
type PublishedContent = {
  assessment: { passingScorePercent: number; questions: { choices: string[]; correctIndex: number }[] };
};

/** Learner assessment submissions are scored only from the pinned, approved publication. */
export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const input = inputSchema.parse(await request.json());
    const result = await db.$transaction(async (tx) => {
      const employees = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
        SELECT e."id", e."status"::text AS "status"
        FROM "TrainingEmployeeUserLink" l
        JOIN "Employee" e ON e."organizationId" = l."organizationId" AND e."id" = l."employeeId"
        WHERE l."organizationId" = ${context.organizationId}::uuid
          AND l."userId" = ${context.userId}::uuid
        FOR UPDATE OF e
      `);
      const employee = resolveOwnTrainingAssignments(context, employees);
      const rows = await tx.$queryRaw<LockedAssignment[]>(Prisma.sql`
        SELECT a."id", a."employeeId", a."courseId", a."publishedVersionId",
          a."status"::text AS "status", p."content"
        FROM "TrainingAssignment" a
        INNER JOIN "TrainingCoursePublishedVersion" p
          ON p."organizationId" = a."organizationId"
          AND p."courseId" = a."courseId"
          AND p."id" = a."publishedVersionId"
        WHERE a."organizationId" = ${context.organizationId}::uuid
          AND a."id" = ${input.assignmentId}::uuid
          AND a."employeeId" = ${employee.id}::uuid
        FOR UPDATE OF a
      `);
      const assignment = rows[0];
      if (!assignment || assignment.status !== "ASSIGNED") throw new Error("Assignment unavailable");
      const published = assignment.content as Partial<PublishedContent> | null;
      if (!published?.assessment || !Array.isArray(published.assessment.questions)) {
        throw new Error("Assessment unavailable");
      }
      let grade;
      try {
        grade = gradeTrainingAssessment(published.assessment.questions, input.answers, published.assessment.passingScorePercent);
      } catch {
        throw new Error("Invalid assessment answers");
      }
      const attempts = await tx.$queryRaw<Array<{ id: string; submittedAt: Date }>>(Prisma.sql`
        INSERT INTO "TrainingAssessmentAttempt"
          ("organizationId", "assignmentId", "employeeId", "courseId", "publishedVersionId",
           "submittedByUserId", "answers", "questionCount", "correctCount", "scorePercent",
           "passingScorePercent", "passed")
        VALUES (
          ${context.organizationId}::uuid, ${assignment.id}::uuid,
          ${employee.id}::uuid, ${assignment.courseId}::uuid,
          ${assignment.publishedVersionId}::uuid, ${context.userId}::uuid,
          ${JSON.stringify(input.answers)}::jsonb, ${grade.questionCount},
          ${grade.correctCount}, ${grade.scorePercent}, ${grade.passingScorePercent},
          ${grade.passed}
        )
        RETURNING "id", "submittedAt"
      `);
      const attempt = attempts[0];
      if (!attempt) throw new Error("Unable to save assessment attempt");
      await tx.auditEvent.create({ data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "TRAINING_ASSESSMENT_SUBMITTED",
        entityType: "TrainingAssessmentAttempt",
        entityId: attempt.id,
        metadata: {
          assignmentId: assignment.id, courseId: assignment.courseId,
          publishedVersionId: assignment.publishedVersionId,
          scorePercent: grade.scorePercent, passed: grade.passed,
        },
      } });
      return { attemptId: attempt.id, submittedAt: attempt.submittedAt, ...grade };
    });
    // No answer key or explanations in the response. Passing does not complete training.
    return NextResponse.json({ data: result }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid assessment request" }, { status: 422 });
    if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
    if (error instanceof Error && ["Assignment unavailable", "Assessment unavailable"].includes(error.message))
      return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof Error && error.message === "Invalid assessment answers")
      return NextResponse.json({ error: error.message }, { status: 422 });
    return NextResponse.json({ error: "Unable to submit assessment" }, { status: 500 });
  }
}
