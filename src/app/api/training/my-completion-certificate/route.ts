import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { resolveOwnTrainingAssignments } from "@/lib/training/employee-training";

const querySchema = z.object({ completionId: z.string().uuid() }).strict();
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

/** Printable evidence of an existing manager-recorded completion, never a practice quiz certificate. */
export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const { completionId } = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const employees = await db.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
      SELECT e."id", e."status"::text AS "status"
      FROM "TrainingEmployeeUserLink" l
      JOIN "Employee" e ON e."organizationId" = l."organizationId" AND e."id" = l."employeeId"
      WHERE l."organizationId" = ${context.organizationId}::uuid AND l."userId" = ${context.userId}::uuid
    `);
    const employee = resolveOwnTrainingAssignments(context, employees);
    const records = await db.$queryRaw<Array<{
      id: string; completedAt: Date; firstName: string; lastName: string;
      courseTitle: string; courseCode: string; result: string | null;
    }>>(Prisma.sql`
      SELECT r."id", r."completedAt", e."firstName", e."lastName",
        c."title" AS "courseTitle", c."code" AS "courseCode", r."result"
      FROM "TrainingRecord" r
      JOIN "TrainingAssignment" a ON a."organizationId" = r."organizationId"
        AND a."id" = r."assignmentId" AND a."employeeId" = r."employeeId"
        AND a."courseId" = r."courseId"
      JOIN "Employee" e ON e."organizationId" = r."organizationId" AND e."id" = r."employeeId"
      JOIN "TrainingCourse" c ON c."organizationId" = r."organizationId" AND c."id" = r."courseId"
      WHERE r."organizationId" = ${context.organizationId}::uuid
        AND r."employeeId" = ${employee.id}::uuid
        AND r."id" = ${completionId}::uuid
        AND a."status"::text = 'COMPLETED'
      LIMIT 1
    `);
    const record = records[0];
    if (!record) return NextResponse.json({ error: "Official completion not found" }, { status: 404 });
    const date = record.completedAt.toISOString().slice(0, 10);
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Training completion record</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:Arial,sans-serif;max-width:760px;margin:70px auto;padding:30px;color:#182b40}main{border:3px solid #173c61;padding:48px;text-align:center}h1{font-size:30px}h2{font-size:25px}p{line-height:1.7}.reference{font-family:monospace;overflow-wrap:anywhere;font-size:13px}@media print{body{margin:0}button{display:none}}</style></head><body><main><h1>Training Completion Record</h1><p>This document reflects a manager-recorded completion in Trace QMS.</p><h2>${escapeHtml(record.firstName)} ${escapeHtml(record.lastName)}</h2><p>Completed: <strong>${escapeHtml(record.courseTitle)}</strong> (${escapeHtml(record.courseCode)})</p><p>Completion date: ${date}</p><p>Recorded result: ${escapeHtml(record.result ?? "Not specified")}</p><p class="reference">Record reference: ${escapeHtml(record.id)}</p><p><small>Generated from an existing controlled training completion. This document does not confer accreditation, continuing education credits, or regulatory certification. Verify the reference against the authenticated Trace QMS record.</small></p></main><p><button onclick="window.print()">Print or save as PDF</button></p></body></html>`;
    return new NextResponse(html, { headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid completion reference" }, { status: 422 });
    if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json({ error: "Unable to render completion record" }, { status: 500 });
  }
}
