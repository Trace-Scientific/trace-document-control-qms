import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondHelpContentError } from "@/lib/platform/help-content-api";
import { HelpContentService } from "@/lib/platform/help-content";
const service = new HelpContentService();
const schema = z.object({ sectionCode: z.string().min(1).max(120), title: z.string().min(1).max(300), displayOrder: z.number().int().optional(), reason: z.string().min(1).max(1000) });
export async function POST(request: NextRequest, { params }: { params: Promise<{ manualId: string }> }) { try { const context = await authenticatePlatformRequest(request); const { manualId } = await params; return NextResponse.json({ data: await service.createManualSection(context, { manualId, ...schema.parse(await request.json()) }) }, { status: 201 }); } catch (error) { return respondHelpContentError(error); } }
