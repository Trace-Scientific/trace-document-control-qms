import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { resolveOwnTrainingAssignments } from "@/lib/training/employee-training";

/** Read-only assessment attempt history for the session-linked employee. */
export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    if (request.nextUrl.searchParams.size !== 0)
      return NextResponse.json({ error: "Unexpected query parameters" }, { status: 422 });
    const employees = await db.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
      SELECT e."id", e."status"::text AS "status"
      FROM "TrainingEmployeeUserLink" l
      INNER JOIN "Employee" e ON e."organizationId" = l."organizationId" AND e."id" = l."employeeId"
      WHERE l."organizationId" = ${context.organizationId}::uuid
        AND l."userId" = ${context.userId}::uuid
    `);
    const employee = resolveOwnTrainingAssignments(context, employees);
    const attempts = await db.$queryRaw<Array<{
      id: string; assignmentId: string; courseCode: string; courseTitle: string;
      submittedAt: Date; scorePercent: number; passingScorePercent: number; passed: boolean;
      correctCount: number; questionCount: number;
    }>>(Prisma.sql`
      SELECT t."id", t."assignmentId", c."code" AS "courseCode", c."title" AS "courseTitle",
        t."submittedAt", t."scorePercent"::float8 AS "scorePercent",
        t."passingScorePercent"::float8 AS "passingScorePercent",
        t."passed", t."correctCount", t."questionCount"
      FROM "TrainingAssessmentAttempt" t
      INNER JOIN "TrainingCourse" c
        ON c."organizationId" = t."organizationId" AND c."id" = t."courseId"
      WHERE t."organizationId" = ${context.organizationId}::uuid
        AND t."employeeId" = ${employee.id}::uuid
      ORDER BY t."submittedAt" DESC, t."id" DESC
      LIMIT 200
    `);
    return NextResponse.json({ data: { attempts } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json({ error: "Unable to retrieve assessment history" }, { status: 500 });
  }
}
