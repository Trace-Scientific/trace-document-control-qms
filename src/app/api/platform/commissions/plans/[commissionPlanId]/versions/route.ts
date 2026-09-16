import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondSalesCommissionError } from "@/lib/platform/sales-commission-api";
import { SalesCommissionService } from "@/lib/platform/sales-commissions";

const service = new SalesCommissionService();
const schema = z.object({
  version: z.number().int().positive(),
  effectiveFrom: z.string().datetime().transform((value) => new Date(value)),
  effectiveTo: z.string().datetime().transform((value) => new Date(value)).nullable().optional(),
  reason: z.string().min(1).max(1000),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ commissionPlanId: string }> }) {
  try {
    const context = await authenticatePlatformRequest(request);
    const { commissionPlanId } = await params;
    const input = schema.parse(await request.json());
    return NextResponse.json({ data: await service.createPlanVersion(context, { commissionPlanId, ...input }) }, { status: 201 });
  } catch (error) {
    return respondSalesCommissionError(error);
  }
}
