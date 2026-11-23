import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";
import { quarantineStaleTrainingRenewalClaims } from "@/lib/training/notification-claims";

const requestBody = z.object({}).strict();
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const { organizationId, userId } = context;
    requireAuthorization(context, { organizationId, permission: "training.manage" });

    const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "application/json") {
      return NextResponse.json({ error: "Expected a JSON recovery request" }, { status: 415, headers });
    }
    const parsed = requestBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success || request.nextUrl.searchParams.size > 0) {
      return NextResponse.json({ error: "Invalid recovery request" }, { status: 422, headers });
    }

    const movedForReview = await db.$transaction((tx) => quarantineStaleTrainingRenewalClaims(tx, organizationId, userId));
    return NextResponse.json({ data: { movedForReview } }, { headers });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401, headers });
    }
    if (error instanceof Error && error.message === "Access denied") {
      return NextResponse.json({ error: "Access denied" }, { status: 403, headers });
    }
    return NextResponse.json({ error: "Unable to recover interrupted reminders" }, { status: 500, headers });
  }
}
