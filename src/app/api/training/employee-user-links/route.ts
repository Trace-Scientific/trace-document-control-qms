import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";

const createSchema = z.object({
  employeeId: z.string().uuid(),
  userId: z.string().uuid(),
}).strict();

type LinkRow = {
  id: string;
  employeeId: string;
  userId: string;
  createdByUserId: string;
  createdAt: Date;
};

// Administrative identity verification only; this route does not grant learner access.
export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "training.manage" });
    const rows = await db.$queryRaw<LinkRow[]>(Prisma.sql`
      SELECT "id", "employeeId", "userId", "createdByUserId", "createdAt"
      FROM "TrainingEmployeeUserLink"
      WHERE "organizationId" = ${context.organizationId}::uuid
      ORDER BY "createdAt" DESC
    `);
    return NextResponse.json({ data: rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return respond(error); }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "training.manage" });
    const input = createSchema.parse(await request.json());
    const link = await db.$transaction(async (tx) => {
      const employees = await tx.$queryRaw<Array<{ status: string }>>(Prisma.sql`
        SELECT "status"::text AS "status" FROM "Employee"
        WHERE "organizationId" = ${context.organizationId}::uuid AND "id" = ${input.employeeId}::uuid
        FOR UPDATE
      `);
      if (!employees[0]) throw new Error("Access denied");
      if (employees[0].status === "TERMINATED") throw new Error("Employee is terminated");
      const users = await tx.user.findMany({
        where: { organizationId: context.organizationId, id: input.userId },
        select: { status: true },
      });
      if (!users[0]) throw new Error("Access denied");
      if (users[0].status !== "ACTIVE") throw new Error("User account must be active");
      const rows = await tx.$queryRaw<LinkRow[]>(Prisma.sql`
        INSERT INTO "TrainingEmployeeUserLink"
          ("organizationId", "employeeId", "userId", "createdByUserId")
        VALUES (
          ${context.organizationId}::uuid,
          ${input.employeeId}::uuid,
          ${input.userId}::uuid,
          ${context.userId}::uuid
        )
        RETURNING "id", "employeeId", "userId", "createdByUserId", "createdAt"
      `);
      const created = rows[0];
      if (!created) throw new Error("Unable to create identity link");
      await tx.auditEvent.create({ data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "TRAINING_EMPLOYEE_USER_LINKED",
        entityType: "TrainingEmployeeUserLink",
        entityId: created.id,
        metadata: { employeeId: created.employeeId, userId: created.userId },
      } });
      return created;
    });
    return NextResponse.json({ data: link }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return respond(error); }
}

function respond(error: unknown) {
  if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid employee account link request" }, { status: 422 });
  if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
  if (error instanceof Error && ["Employee is terminated", "User account must be active"].includes(error.message))
    return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2010"))
    return NextResponse.json({ error: "Employee or user is already linked, or the link could not be created" }, { status: 409 });
  return NextResponse.json({ error: "Employee account linking operation failed" }, { status: 500 });
}
