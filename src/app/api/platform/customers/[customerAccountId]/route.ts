import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondCustomerAccountError } from "@/lib/platform/customer-account-api";
import { CustomerAccountService } from "@/lib/platform/customer-accounts";

const service = new CustomerAccountService();
const metadataSchema = z.record(z.string(), z.unknown());
const updateSchema = z.object({
  accountCode: z.string().min(1).max(120).optional(),
  legalName: z.string().min(1).max(300).optional(),
  displayName: z.string().min(1).max(300).optional(),
  organizationId: z.string().uuid().nullable().optional(),
  commercialMetadata: metadataSchema.optional(),
  expectedLockVersion: z.number().int().nonnegative(),
  reason: z.string().min(1).max(1000),
}).refine(
  (value) =>
    value.accountCode !== undefined ||
    value.legalName !== undefined ||
    value.displayName !== undefined ||
    value.organizationId !== undefined ||
    value.commercialMetadata !== undefined,
  { message: "At least one customer account field must be changed" },
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerAccountId: string }> },
) {
  try {
    const context = await authenticatePlatformRequest(request);
    const customerAccountId = z.string().uuid().parse((await params).customerAccountId);
    return NextResponse.json({ data: await service.get(context, customerAccountId) });
  } catch (error) {
    return respondCustomerAccountError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ customerAccountId: string }> },
) {
  try {
    const context = await authenticatePlatformRequest(request);
    const customerAccountId = z.string().uuid().parse((await params).customerAccountId);
    const input = updateSchema.parse(await request.json());
    return NextResponse.json({
      data: await service.update(context, { customerAccountId, ...input }),
    });
  } catch (error) {
    return respondCustomerAccountError(error);
  }
}