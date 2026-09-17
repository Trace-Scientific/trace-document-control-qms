import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";
import { platformTwilioMonitoringSchedulerService } from "@/lib/platform/integration-runtime";

export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const data = await platformTwilioMonitoringSchedulerService.runScheduled(25);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Twilio delivery-status monitoring failed" }, { status: 503 });
  }
}
