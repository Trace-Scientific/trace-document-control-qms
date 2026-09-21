import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";
import { SupportSlaSchedulerService } from "@/lib/platform/support-sla-scheduler";

const scheduler = new SupportSlaSchedulerService();

export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ data: await scheduler.runScheduled() });
  } catch {
    return NextResponse.json({ error: "Support SLA scheduled scan failed" }, { status: 503 });
  }
}
