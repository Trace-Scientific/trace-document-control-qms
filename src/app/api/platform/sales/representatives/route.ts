import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondSalesCommissionError } from "@/lib/platform/sales-commission-api";
import { SalesCommissionService } from "@/lib/platform/sales-commissions";

const service = new SalesCommissionService();
const createSchema = z.object({
  platformIdentityId: z.string().uuid(),
  displayName: z.string().min(1).max(300),
  reason: z.string().min(1).max(1000),
});

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({ data: await service.listRepresentatives(await authenticatePlatformRequest(request)) });
  } catch (error) {
    return respondSalesCommissionError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    const input = createSchema.parse(await request.json());
    return NextResponse.json({ data: await service.createRepresentative(context, input) }, { status: 201 });
  } catch (error) {
    return respondSalesCommissionError(error);
  }
}
