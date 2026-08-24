import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { PrismaApprovalSignatureStore, SignatureConfigurationError, SignatureEligibilityError } from "@/lib/signatures/prisma-store";
import { ApprovalSignatureService, ReauthenticationFailedError, ReauthenticationThrottledError, SignatureConcurrencyError, SignatureValidationError } from "@/lib/signatures/service";

const inputSchema = z.object({ versionId: z.string().uuid(), expectedLockVersion: z.number().int().nonnegative(), password: z.string().min(1).max(1024), confirmed: z.literal(true) });
const service = new ApprovalSignatureService(new PrismaApprovalSignatureStore());

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const result = await service.signApproval(context, { ...inputSchema.parse(await request.json()), organizationId: context.organizationId });
    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError || error instanceof ReauthenticationFailedError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof ReauthenticationThrottledError) return NextResponse.json({ error: error.message }, { status: 429 });
    if (error instanceof SignatureEligibilityError) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    if (error instanceof SignatureConcurrencyError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof z.ZodError || error instanceof SignatureValidationError || error instanceof SignatureConfigurationError) return NextResponse.json({ error: "The signature request is invalid" }, { status: 422 });
    if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json({ error: "Unable to sign the document" }, { status: 500 });
  }
}
