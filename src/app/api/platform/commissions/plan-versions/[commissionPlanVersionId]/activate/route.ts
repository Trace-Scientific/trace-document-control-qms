import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondSalesCommissionError } from "@/lib/platform/sales-commission-api";
import { SalesCommissionService } from "@/lib/platform/sales-commissions";

const service = new SalesCommissionService();
const schema = z.object({ reason: z.string().min(1).max(1000) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ commissionPlanVersionId: string }> }) {
  try {
    const context = await authenticatePlatformRequest(request);
    const { commissionPlanVersionId } = await params;
    const { reason } = schema.parse(await request.json());
    return NextResponse.json({ data: await service.activatePlanVersion(context, { commissionPlanVersionId, reason }) });
  } catch (error) {
    return respondSalesCommissionError(error);
  }
}
