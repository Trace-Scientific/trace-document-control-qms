import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondHelpContentError } from "@/lib/platform/help-content-api";
import { HelpContentService } from "@/lib/platform/help-content";
const service = new HelpContentService();
const schema = z.object({ body: z.string().min(1), changeSummary: z.string().min(1).max(1000), reason: z.string().min(1).max(1000) });
export async function POST(request: NextRequest, { params }: { params: Promise<{ sectionId: string }> }) { try { const context = await authenticatePlatformRequest(request); const { sectionId } = await params; return NextResponse.json({ data: await service.addManualSectionRevision(context, { sectionId, ...schema.parse(await request.json()) }) }, { status: 201 }); } catch (error) { return respondHelpContentError(error); } }
