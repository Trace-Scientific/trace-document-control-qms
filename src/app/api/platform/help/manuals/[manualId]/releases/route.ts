import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondHelpContentError } from "@/lib/platform/help-content-api";
import { HelpContentService } from "@/lib/platform/help-content";
const service = new HelpContentService();
const schema = z.object({ version: z.string().min(1).max(80), effectiveAt: z.coerce.date(), releaseApplicability: z.record(z.string(), z.unknown()).optional(), releaseNotes: z.string().min(1).max(4000), reason: z.string().min(1).max(1000) });
export async function POST(request: NextRequest, { params }: { params: Promise<{ manualId: string }> }) { try { const context = await authenticatePlatformRequest(request); const { manualId } = await params; return NextResponse.json({ data: await service.createManualRelease(context, { manualId, ...schema.parse(await request.json()) }) }, { status: 201 }); } catch (error) { return respondHelpContentError(error); } }
