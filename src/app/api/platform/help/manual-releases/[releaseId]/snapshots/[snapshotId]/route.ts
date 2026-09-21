import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePlatformRequest } from "@/lib/platform/authenticated-request";
import { respondHelpContentError } from "@/lib/platform/help-content-api";
import { ManualReleaseSnapshotService } from "@/lib/platform/manual-release-snapshots";

const service = new ManualReleaseSnapshotService();

export async function GET(request: NextRequest, { params }: { params: Promise<{ releaseId: string; snapshotId: string }> }) {
  try {
    const context = await authenticatePlatformRequest(request);
    const raw = await params;
    const releaseId = z.string().uuid().parse(raw.releaseId);
    const snapshotId = z.string().uuid().parse(raw.snapshotId);
    const { snapshot, bytes } = await service.download(context, { releaseId, snapshotId });
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${snapshot.originalName.replace(/["\\]/g, "_")}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "x-trace-qms-sha256": snapshot.sha256,
      },
    });
  } catch (error) {
    return respondHelpContentError(error);
  }
}
