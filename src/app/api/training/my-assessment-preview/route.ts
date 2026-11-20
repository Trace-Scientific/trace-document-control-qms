import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { PrismaTrainingStore } from "@/lib/training/training-store";
import { DemoQuizValidationError } from "@/lib/training/demo-quiz";
import { previewOwnDemoQuiz } from "@/lib/training/employee-demo-assessment-preview";

const schema = z.object({
  assignmentId: z.string().uuid(),
  answers: z.array(z.number().int().nonnegative()).max(20),
}).strict();
const store = new PrismaTrainingStore();

/** Read-only practice scoring for the authenticated employee's own assignment. */
export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const input = schema.parse(await request.json());
    const employees = await db.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
      SELECT "id", "status"::text AS "status" FROM "Employee"
      WHERE "organizationId" = ${context.organizationId}::uuid
        AND "userId" = ${context.userId}::uuid
    `);
    const result = await previewOwnDemoQuiz(context, employees, store, input);
    return NextResponse.json({ data: result }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof z.ZodError || error instanceof DemoQuizValidationError) return NextResponse.json({ error: "Invalid practice assessment" }, { status: 422 });
    if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json({ error: "Practice assessment unavailable" }, { status: 500 });
  }
}
