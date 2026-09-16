import { NextRequest, NextResponse } from "next/server";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { PlatformNotificationReportingService } from "@/lib/platform/notifications-reporting";
import { respondPlatformNotificationReportingError } from "@/lib/platform/notifications-reporting-api";

const service = new PlatformNotificationReportingService();

export async function GET(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    return NextResponse.json({ data: await service.listRecentReportRuns(context) });
  } catch (error) {
    return respondPlatformNotificationReportingError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    return NextResponse.json({ data: await service.generateOperationalReport(context) }, { status: 201 });
  } catch (error) {
    return respondPlatformNotificationReportingError(error);
  }
}
