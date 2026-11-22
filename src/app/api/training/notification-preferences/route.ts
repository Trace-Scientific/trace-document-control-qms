import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";

const schema = z.object({
  enabled: z.boolean(),
  remind30Days: z.boolean(),
  remind7Days: z.boolean(),
  remindOverdue: z.boolean(),
}).strict();

function errorResponse(error: unknown) {
  if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid notification preferences" }, { status: 422 });
  if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
  return NextResponse.json({ error: "Unable to process notification preferences" }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "training.manage" });
    if (request.nextUrl.searchParams.size) return NextResponse.json({ error: "Unexpected query parameters" }, { status: 422 });
    const rows = await db.$queryRaw<Array<{
      enabled: boolean; remind30Days: boolean; remind7Days: boolean; remindOverdue: boolean;
    }>>(Prisma.sql`
      SELECT "enabled", "remind30Days", "remind7Days", "remindOverdue"
      FROM "TrainingNotificationPreference" WHERE "organizationId" = ${context.organizationId}::uuid
    `);
    return NextResponse.json({
      data: rows[0] ?? { enabled: false, remind30Days: true, remind7Days: true, remindOverdue: true },
      deliveryActive: false,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "training.manage" });
    const input = schema.parse(await request.json());
    await db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "TrainingNotificationPreference"
          ("organizationId", "enabled", "remind30Days", "remind7Days", "remindOverdue", "updatedByUserId")
        VALUES (${context.organizationId}::uuid, ${input.enabled}, ${input.remind30Days},
          ${input.remind7Days}, ${input.remindOverdue}, ${context.userId}::uuid)
        ON CONFLICT ("organizationId") DO UPDATE SET
          "enabled" = EXCLUDED."enabled",
          "remind30Days" = EXCLUDED."remind30Days",
          "remind7Days" = EXCLUDED."remind7Days",
          "remindOverdue" = EXCLUDED."remindOverdue",
          "updatedByUserId" = EXCLUDED."updatedByUserId",
          "updatedAt" = CURRENT_TIMESTAMP
      `);
      await tx.auditEvent.create({ data: {
        organizationId: context.organizationId, actorUserId: context.userId,
        action: "TRAINING_NOTIFICATION_PREFERENCES_UPDATED",
        entityType: "Organization", entityId: context.organizationId,
        metadata: { ...input, deliveryActive: false },
      } });
    });
    return NextResponse.json({ data: input, deliveryActive: false }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
