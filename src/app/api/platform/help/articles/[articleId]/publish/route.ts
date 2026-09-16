import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondHelpContentError } from "@/lib/platform/help-content-api";
import { HelpContentService } from "@/lib/platform/help-content";
const service = new HelpContentService();
const schema = z.object({ revisionId: z.string().uuid(), expectedLockVersion: z.number().int().positive(), reason: z.string().min(1).max(1000) });
export async function POST(request: NextRequest, { params }: { params: Promise<{ articleId: string }> }) { try { const context = await authenticatePlatformRequest(request); const { articleId } = await params; return NextResponse.json({ data: await service.publishArticleRevision(context, { articleId, ...schema.parse(await request.json()) }) }); } catch (error) { return respondHelpContentError(error); } }
