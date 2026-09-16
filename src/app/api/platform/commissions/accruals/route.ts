import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondSalesCommissionError } from "@/lib/platform/sales-commission-api";
import { SalesCommissionService } from "@/lib/platform/sales-commissions";

const service = new SalesCommissionService();
const schema = z.object({
  salesAssignmentId: z.string().uuid(),
  commissionRuleId: z.string().uuid(),
  sourceType: z.string().min(1).max(120),
  sourceReference: z.string().min(1).max(300),
  basisAmount: z.number().nonnegative(),
  reason: z.string().min(1).max(1000),
});

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({ data: await service.listAccruals(await authenticatePlatformRequest(request)) });
  } catch (error) {
    return respondSalesCommissionError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    return NextResponse.json({ data: await service.createAccrual(context, schema.parse(await request.json())) }, { status: 201 });
  } catch (error) {
    return respondSalesCommissionError(error);
  }
}
