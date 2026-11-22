import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";

const updateSchema = z.object({
  courseId: z.string().uuid(),
  intervalMonths: z.number().int().min(1).max(120).nullable(),
}).strict();

function respond(error: unknown) {
  if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid renewal policy" }, { status: 422 });
  if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
  return NextResponse.json({ error: "Unable to process renewal policy" }, { status: 500 });
}

/** Course renewal intervals are policy metadata, not automated assignments. */
export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "training.read" });
    if (request.nextUrl.searchParams.size) return NextResponse.json({ error: "Unexpected query parameters" }, { status: 422 });
    const policies = await db.$queryRaw<Array<{ courseId: string; intervalMonths: number; updatedAt: Date }>>(Prisma.sql`
      SELECT "courseId", "intervalMonths", "updatedAt"
      FROM "TrainingCourseRenewalPolicy" WHERE "organizationId" = ${context.organizationId}::uuid
      ORDER BY "courseId"
    `);
    return NextResponse.json({ data: policies }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return respond(error); }
}

export async function PUT(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "training.manage" });
    const input = updateSchema.parse(await request.json());
    const result = await db.$transaction(async (tx) => {
      const courses = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "TrainingCourse"
        WHERE "organizationId" = ${context.organizationId}::uuid AND "id" = ${input.courseId}::uuid FOR UPDATE
      `);
      if (!courses[0]) return null;
      if (input.intervalMonths === null) {
        await tx.$executeRaw(Prisma.sql`
          DELETE FROM "TrainingCourseRenewalPolicy"
          WHERE "organizationId" = ${context.organizationId}::uuid AND "courseId" = ${input.courseId}::uuid
        `);
      } else {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "TrainingCourseRenewalPolicy" ("organizationId", "courseId", "intervalMonths", "updatedByUserId")
          VALUES (${context.organizationId}::uuid, ${input.courseId}::uuid, ${input.intervalMonths}, ${context.userId}::uuid)
          ON CONFLICT ("organizationId", "courseId") DO UPDATE SET
            "intervalMonths" = EXCLUDED."intervalMonths",
            "updatedByUserId" = EXCLUDED."updatedByUserId",
            "updatedAt" = CURRENT_TIMESTAMP
        `);
      }
      await tx.auditEvent.create({ data: {
        organizationId: context.organizationId, actorUserId: context.userId,
        action: "TRAINING_RENEWAL_POLICY_UPDATED", entityType: "TrainingCourse", entityId: input.courseId,
        metadata: { intervalMonths: input.intervalMonths },
      } });
      return { courseId: input.courseId, intervalMonths: input.intervalMonths };
    });
    if (!result) return NextResponse.json({ error: "Course not found" }, { status: 404 });
    return NextResponse.json({ data: result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return respond(error); }
}
