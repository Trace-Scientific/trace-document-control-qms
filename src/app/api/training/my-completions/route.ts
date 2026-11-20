import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { resolveOwnTrainingAssignments } from "@/lib/training/employee-training";

/** Read-only official training history for the authenticated employee only. */
export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const employees = await db.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
      SELECT "id", "status"::text AS "status" FROM "Employee"
      WHERE "organizationId" = ${context.organizationId}::uuid
        AND "userId" = ${context.userId}::uuid
    `);
    const employee = resolveOwnTrainingAssignments(context, employees);
    const completions = await db.$queryRaw<Array<{
      id: string; assignmentId: string; courseCode: string; courseTitle: string;
      completedAt: Date; result: string | null;
    }>>(Prisma.sql`
      SELECT r."id", r."assignmentId", c."code" AS "courseCode",
             c."title" AS "courseTitle", r."completedAt", r."result"
      FROM "TrainingRecord" r
      INNER JOIN "TrainingCourse" c
        ON c."organizationId" = r."organizationId" AND c."id" = r."courseId"
      WHERE r."organizationId" = ${context.organizationId}::uuid
        AND r."employeeId" = ${employee.id}::uuid
      ORDER BY r."completedAt" DESC
    `);
    return NextResponse.json({ data: { completions } }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json({ error: "Unable to retrieve training history" }, { status: 500 });
  }
}
