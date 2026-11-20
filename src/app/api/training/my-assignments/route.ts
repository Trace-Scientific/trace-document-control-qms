import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { resolveOwnTrainingAssignments } from "@/lib/training/employee-training";

/** Employee self-service: read only, identity derived exclusively from the session. */
export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const employees = await db.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
      SELECT "id", "status"::text AS "status" FROM "Employee"
      WHERE "organizationId" = ${context.organizationId}::uuid
        AND "userId" = ${context.userId}::uuid
    `);
    const employee = resolveOwnTrainingAssignments(context, employees);
    const assignments = await db.$queryRaw<Array<{ id: string; courseCode: string; courseTitle: string; assignedAt: Date; dueAt: Date | null; status: string }>>(Prisma.sql`
      SELECT a."id", c."code" AS "courseCode", c."title" AS "courseTitle",
             a."assignedAt", a."dueAt", a."status"::text AS "status"
      FROM "TrainingAssignment" a
      INNER JOIN "TrainingCourse" c
        ON c."organizationId" = a."organizationId" AND c."id" = a."courseId"
      WHERE a."organizationId" = ${context.organizationId}::uuid
        AND a."employeeId" = ${employee.id}::uuid
      ORDER BY a."assignedAt" DESC
    `);
    return NextResponse.json({ data: { assignments } }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json({ error: "Unable to retrieve employee training" }, { status: 500 });
  }
}
