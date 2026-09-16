import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { PlatformNotificationReportingService } from "@/lib/platform/notifications-reporting";
import { respondPlatformNotificationReportingError } from "@/lib/platform/notifications-reporting-api";

const service = new PlatformNotificationReportingService();
const schema = z.object({ reason: z.string().min(1).max(1000) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ notificationId: string }> },
) {
  try {
    const context = await authenticatePlatformRequest(request);
    const { notificationId } = await params;
    z.string().uuid().parse(notificationId);
    const { reason } = schema.parse(await request.json());
    return NextResponse.json({ data: await service.requeueDeadLetter(context, notificationId, reason) });
  } catch (error) {
    return respondPlatformNotificationReportingError(error);
  }
}
