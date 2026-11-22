import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";

const querySchema = z.object({
  employeeId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
}).strict();

/** Manager-only tenant-scoped assessment results; never return answers or keys. */
export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "training.manage" });
    const input = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const employeeFilter = input.employeeId
      ? Prisma.sql`AND t."employeeId" = ${input.employeeId}::uuid`
      : Prisma.empty;
    const courseFilter = input.courseId
      ? Prisma.sql`AND t."courseId" = ${input.courseId}::uuid`
      : Prisma.empty;
    const attempts = await db.$queryRaw<Array<{
      id: string; assignmentId: string; employeeId: string; employeeName: string;
      courseId: string; courseCode: string; courseTitle: string; submittedAt: Date;
      scorePercent: number; passingScorePercent: number; passed: boolean;
      correctCount: number; questionCount: number; publishedVersionId: string;
    }>>(Prisma.sql`
      SELECT t."id", t."assignmentId", t."employeeId",
        e."firstName" || ' ' || e."lastName" AS "employeeName",
        t."courseId", c."code" AS "courseCode", c."title" AS "courseTitle",
        t."submittedAt", t."scorePercent"::float8 AS "scorePercent",
        t."passingScorePercent"::float8 AS "passingScorePercent",
        t."passed", t."correctCount", t."questionCount", t."publishedVersionId"
      FROM "TrainingAssessmentAttempt" t
      INNER JOIN "Employee" e ON e."organizationId" = t."organizationId" AND e."id" = t."employeeId"
      INNER JOIN "TrainingCourse" c ON c."organizationId" = t."organizationId" AND c."id" = t."courseId"
      WHERE t."organizationId" = ${context.organizationId}::uuid
        ${employeeFilter} ${courseFilter}
      ORDER BY t."submittedAt" DESC, t."id" DESC
      LIMIT ${input.limit}
    `);
    return NextResponse.json({ data: { attempts } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid assessment report filters" }, { status: 422 });
    if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json({ error: "Unable to retrieve assessment report" }, { status: 500 });
  }
}
