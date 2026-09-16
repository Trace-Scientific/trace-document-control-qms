import { NextRequest, NextResponse } from "next/server";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { PlatformNotificationReportingService } from "@/lib/platform/notifications-reporting";
import { respondPlatformNotificationReportingError } from "@/lib/platform/notifications-reporting-api";

const service = new PlatformNotificationReportingService();

export async function GET(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    return NextResponse.json({ data: await service.listInbox(context) });
  } catch (error) {
    return respondPlatformNotificationReportingError(error);
  }
}
