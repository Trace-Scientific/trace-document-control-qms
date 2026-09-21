import { NextRequest, NextResponse } from "next/server";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { PlatformAuthorizationError } from "@/lib/platform/authorization";
import { SupportSlaEscalationService } from "@/lib/platform/support-sla-escalation";

const service = new SupportSlaEscalationService();

export async function POST(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    return NextResponse.json({ data: await service.scan(context) }, { status: 201 });
  } catch (error) {
    if (error instanceof PlatformAuthorizationError) {
      return NextResponse.json({ error: "Platform access denied" }, { status: 403 });
    }
    return NextResponse.json({ error: "Support SLA escalation scan failed" }, { status: 500 });
  }
}
