import { NextRequest, NextResponse } from "next/server";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondHelpContentError } from "@/lib/platform/help-content-api";
import { HelpContentService } from "@/lib/platform/help-content";
const service = new HelpContentService();
export async function GET(request: NextRequest, { params }: { params: Promise<{ manualId: string }> }) { try { const context = await authenticatePlatformRequest(request); const { manualId } = await params; return NextResponse.json({ data: await service.getManualAuthoring(context, manualId) }); } catch (error) { return respondHelpContentError(error); } }
