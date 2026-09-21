import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { PlatformAuthorizationError } from "@/lib/platform/authorization";
import { HelpSupportQueueConflictError, HelpSupportQueueService, HelpSupportQueueValidationError } from "@/lib/platform/help-support-queue";

const service = new HelpSupportQueueService();
const statusSchema = z.enum(["OPEN","ACKNOWLEDGED","CLOSED"]);
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ACKNOWLEDGE"), reason: z.string().min(1).max(1000) }),
  z.object({ action: z.literal("CLOSE"), reason: z.string().min(1).max(1000) }),
  z.object({
    action: z.literal("ASSIGN"),
    assignedToIdentityId: z.string().uuid(),
    responseDueAt: z.string().datetime().nullable().optional(),
    closureDueAt: z.string().datetime().nullable().optional(),
    reason: z.string().min(1).max(1000),
  }),
]);

export async function GET(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    const url = new URL(request.url);
    if (url.searchParams.get("view") === "owners") {
      return NextResponse.json({ data: await service.listAssignableOwners(context) }, { headers: { "Cache-Control": "no-store" } });
    }
    const raw = url.searchParams.get("status");
    const status = raw ? statusSchema.parse(raw) : undefined;
    return NextResponse.json({ data: await service.list(context, status) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PlatformAuthorizationError) return NextResponse.json({ error: "Platform access denied" }, { status: 403 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid support queue filter" }, { status: 400 });
    return NextResponse.json({ error: "Support intake queue could not be loaded" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    const requestId = new URL(request.url).searchParams.get("id");
    if (!requestId || !z.string().uuid().safeParse(requestId).success) return NextResponse.json({ error: "Valid support request id is required" }, { status: 400 });
    const input = actionSchema.parse(await request.json());
    if (input.action === "ACKNOWLEDGE") await service.acknowledge(context, requestId, input.reason);
    else if (input.action === "CLOSE") await service.close(context, requestId, input.reason);
    else await service.assign(context, requestId, input);
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    if (error instanceof PlatformAuthorizationError) return NextResponse.json({ error: "Platform access denied" }, { status: 403 });
    if (error instanceof z.ZodError || error instanceof HelpSupportQueueValidationError) return NextResponse.json({ error: "Support queue action validation failed" }, { status: 400 });
    if (error instanceof HelpSupportQueueConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: "Support queue action failed" }, { status: 500 });
  }
}
