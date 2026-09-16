import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { PlatformNotificationReportingService } from "@/lib/platform/notifications-reporting";
import { respondPlatformNotificationReportingError } from "@/lib/platform/notifications-reporting-api";

const service = new PlatformNotificationReportingService();
const statusSchema = z.enum(["PENDING", "PROCESSING", "RETRY", "SENT", "DEAD_LETTER"]);

export async function GET(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    const raw = request.nextUrl.searchParams.get("status");
    const status = raw ? statusSchema.parse(raw) : null;
    return NextResponse.json({ data: await service.listDeliveryMonitor(context, status) });
  } catch (error) {
    return respondPlatformNotificationReportingError(error);
  }
}
