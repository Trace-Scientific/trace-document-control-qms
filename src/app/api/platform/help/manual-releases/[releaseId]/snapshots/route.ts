import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondHelpContentError } from "@/lib/platform/help-content-api";
import { ManualReleaseSnapshotService } from "@/lib/platform/manual-release-snapshots";

const service = new ManualReleaseSnapshotService();
const createSchema = z.object({ reason: z.string().min(1).max(1000) });

export async function GET(request: NextRequest, { params }: { params: Promise<{ releaseId: string }> }) {
  try {
    const context = await authenticatePlatformRequest(request);
    const releaseId = z.string().uuid().parse((await params).releaseId);
    const rows = await service.list(context, releaseId);
    return NextResponse.json({ data: rows.map((row) => ({ ...row, sizeBytes: row.sizeBytes.toString() })) });
  } catch (error) {
    return respondHelpContentError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ releaseId: string }> }) {
  try {
    const context = await authenticatePlatformRequest(request);
    const releaseId = z.string().uuid().parse((await params).releaseId);
    const input = createSchema.parse(await request.json());
    const result = await service.create(context, { releaseId, reason: input.reason });
    return NextResponse.json({
      data: { ...result.snapshot, sizeBytes: result.snapshot.sizeBytes.toString(), created: result.created },
    }, { status: result.created ? 201 : 200 });
  } catch (error) {
    return respondHelpContentError(error);
  }
}
