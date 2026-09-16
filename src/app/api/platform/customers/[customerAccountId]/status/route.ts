import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondCustomerAccountError } from "@/lib/platform/customer-account-api";
import {
  CUSTOMER_ACCOUNT_STATUSES,
  CustomerAccountService,
} from "@/lib/platform/customer-accounts";

const service = new CustomerAccountService();
const statusSchema = z.object({
  toStatus: z.enum(CUSTOMER_ACCOUNT_STATUSES),
  expectedLockVersion: z.number().int().nonnegative(),
  reason: z.string().min(1).max(1000),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ customerAccountId: string }> },
) {
  try {
    const context = await authenticatePlatformRequest(request);
    const customerAccountId = z.string().uuid().parse((await params).customerAccountId);
    const input = statusSchema.parse(await request.json());
    return NextResponse.json({
      data: await service.transitionStatus(context, { customerAccountId, ...input }),
    });
  } catch (error) {
    return respondCustomerAccountError(error);
  }
}