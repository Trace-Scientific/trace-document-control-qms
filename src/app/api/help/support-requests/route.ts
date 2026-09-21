import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { createHelpSupportRequest, HELP_SUPPORT_CATEGORIES, HELP_SUPPORT_PRIORITIES, HelpSupportRequestValidationError } from "@/lib/platform/help-support-request";

const schema = z.object({
  subject: z.string().min(3).max(200),
  description: z.string().min(10).max(4000),
  category: z.enum(HELP_SUPPORT_CATEGORIES),
  priority: z.enum(HELP_SUPPORT_PRIORITIES),
  applicationVersion: z.string().max(120).nullish(),
  pageContext: z.string().max(120).nullish(),
  browserFamily: z.string().max(120).nullish(),
  correlationId: z.string().max(160).nullish(),
});

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const input = schema.parse(await request.json());
    const data = await createHelpSupportRequest(context, input);
    return NextResponse.json({ data: { id: data.id, status: data.status, submittedAt: data.submittedAt } }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof z.ZodError || error instanceof HelpSupportRequestValidationError) return NextResponse.json({ error: "Support request validation failed" }, { status: 400 });
    return NextResponse.json({ error: "Support request could not be submitted" }, { status: 500 });
  }
}
