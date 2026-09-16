import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondSalesCommissionError } from "@/lib/platform/sales-commission-api";
import { SalesCommissionService } from "@/lib/platform/sales-commissions";

const service = new SalesCommissionService();
const schema = z.object({
  ruleCode: z.string().min(1).max(120),
  ruleType: z.enum(["PERCENTAGE", "FIXED"]),
  rate: z.number().nonnegative().nullable().optional(),
  fixedAmount: z.number().nonnegative().nullable().optional(),
  currency: z.string().length(3).optional(),
  description: z.string().min(1).max(1000),
  reason: z.string().min(1).max(1000),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ commissionPlanVersionId: string }> }) {
  try {
    const context = await authenticatePlatformRequest(request);
    const { commissionPlanVersionId } = await params;
    const input = schema.parse(await request.json());
    return NextResponse.json({ data: await service.addRule(context, { commissionPlanVersionId, ...input }) }, { status: 201 });
  } catch (error) {
    return respondSalesCommissionError(error);
  }
}
