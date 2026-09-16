import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondSalesCommissionError } from "@/lib/platform/sales-commission-api";
import { SalesCommissionService } from "@/lib/platform/sales-commissions";

const service = new SalesCommissionService();
const createSchema = z.object({
  salesRepresentativeId: z.string().uuid(),
  customerAccountId: z.string().uuid(),
  startsAt: z.string().datetime().transform((value) => new Date(value)),
  endsAt: z.string().datetime().transform((value) => new Date(value)).nullable().optional(),
  reason: z.string().min(1).max(1000),
});

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({ data: await service.listAssignments(await authenticatePlatformRequest(request)) });
  } catch (error) {
    return respondSalesCommissionError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    const input = createSchema.parse(await request.json());
    return NextResponse.json({ data: await service.createAssignment(context, input) }, { status: 201 });
  } catch (error) {
    return respondSalesCommissionError(error);
  }
}
