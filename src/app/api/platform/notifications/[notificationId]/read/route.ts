import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { PlatformNotificationReportingService } from "@/lib/platform/notifications-reporting";
import { respondPlatformNotificationReportingError } from "@/lib/platform/notifications-reporting-api";

const service = new PlatformNotificationReportingService();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ notificationId: string }> },
) {
  try {
    const context = await authenticatePlatformRequest(request);
    const { notificationId } = await params;
    z.string().uuid().parse(notificationId);
    return NextResponse.json({ data: await service.markRead(context, notificationId) });
  } catch (error) {
    return respondPlatformNotificationReportingError(error);
  }
}
