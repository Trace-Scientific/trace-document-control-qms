import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  authenticateRequest,
  AuthenticationRequiredError,
} from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";

const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, {
      organizationId: context.organizationId,
      permission: "audit.read",
    });

    const params = request.nextUrl.searchParams;
    const rawLimit = Number(params.get("limit") ?? "25");
    const limit = Number.isInteger(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
      : 25;
    const cursor = params.get("cursor") || undefined;
    const action = params.get("action")?.trim() || undefined;
    const entityType = params.get("entityType")?.trim() || undefined;
    const from = params.get("from") ? new Date(String(params.get("from"))) : null;
    const to = params.get("to") ? new Date(String(params.get("to"))) : null;

    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      return NextResponse.json({ error: "Invalid audit date filter" }, { status: 400 });
    }

    const rows = await db.auditEvent.findMany({
      where: {
        organizationId: context.organizationId,
        ...(action ? { action } : {}),
        ...(entityType ? { entityType } : {}),
        ...(from || to
          ? {
              occurredAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        occurredAt: true,
        action: true,
        entityType: true,
        entityId: true,
        entityVersion: true,
        previousHash: true,
        newHash: true,
        correlationId: true,
        requestId: true,
        reason: true,
        metadata: true,
        actor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return NextResponse.json({
      data: {
        items,
        nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
      },
    });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Access denied") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to load audit history" }, { status: 500 });
  }
}
