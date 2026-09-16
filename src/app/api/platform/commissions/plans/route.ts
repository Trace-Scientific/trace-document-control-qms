import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondSalesCommissionError } from "@/lib/platform/sales-commission-api";
import { SalesCommissionService } from "@/lib/platform/sales-commissions";

const service = new SalesCommissionService();
const schema = z.object({ code: z.string().min(1).max(120), name: z.string().min(1).max(300), reason: z.string().min(1).max(1000) });

export async function POST(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    return NextResponse.json({ data: await service.createCommissionPlan(context, schema.parse(await request.json())) }, { status: 201 });
  } catch (error) {
    return respondSalesCommissionError(error);
  }
}
