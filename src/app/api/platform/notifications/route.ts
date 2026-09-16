import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { PlatformNotificationReportingService } from "@/lib/platform/notifications-reporting";
import { respondPlatformNotificationReportingError } from "@/lib/platform/notifications-reporting-api";

const service = new PlatformNotificationReportingService();
const schema = z.object({
  notificationType: z.string().min(1).max(160),
  subject: z.string().min(1).max(240),
  body: z.string().min(1).max(10000),
  recipientIdentityId: z.string().uuid(),
  customerAccountId: z.string().uuid().nullable().optional(),
  channel: z.enum(["IN_APP", "EMAIL"]).optional(),
  dedupeKey: z.string().min(1).max(240).nullable().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().min(1).max(1000),
});

export async function POST(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    const input = schema.parse(await request.json());
    return NextResponse.json({ data: await service.enqueue(context, input) }, { status: 201 });
  } catch (error) {
    return respondPlatformNotificationReportingError(error);
  }
}
