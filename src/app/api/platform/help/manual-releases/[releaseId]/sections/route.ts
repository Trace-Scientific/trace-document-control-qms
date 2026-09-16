import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondHelpContentError } from "@/lib/platform/help-content-api";
import { HelpContentService } from "@/lib/platform/help-content";
const service = new HelpContentService();
const schema = z.object({ sectionRevisionIds: z.array(z.string().uuid()).min(1), expectedLockVersion: z.number().int().positive(), reason: z.string().min(1).max(1000) });
export async function PUT(request: NextRequest, { params }: { params: Promise<{ releaseId: string }> }) { try { const context = await authenticatePlatformRequest(request); const { releaseId } = await params; return NextResponse.json({ data: await service.setManualReleaseSections(context, { releaseId, ...schema.parse(await request.json()) }) }); } catch (error) { return respondHelpContentError(error); } }
