import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondCustomerAccountError } from "@/lib/platform/customer-account-api";
import { CustomerAccountService } from "@/lib/platform/customer-accounts";

const service = new CustomerAccountService();
const metadataSchema = z.record(z.string(), z.unknown());
const createSchema = z.object({
  accountCode: z.string().min(1).max(120),
  legalName: z.string().min(1).max(300),
  displayName: z.string().min(1).max(300),
  organizationId: z.string().uuid().nullable().optional(),
  commercialMetadata: metadataSchema.optional(),
  reason: z.string().min(1).max(1000),
});

export async function GET(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    return NextResponse.json({ data: await service.list(context) });
  } catch (error) {
    return respondCustomerAccountError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await authenticatePlatformRequest(request);
    const input = createSchema.parse(await request.json());
    return NextResponse.json({ data: await service.create(context, input) }, { status: 201 });
  } catch (error) {
    return respondCustomerAccountError(error);
  }
}