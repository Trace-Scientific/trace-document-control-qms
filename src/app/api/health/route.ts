import { NextResponse } from "next/server";
import { releaseIdentity } from "@/lib/operations/release-identity";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "trace-document-control-qms",
    release: releaseIdentity(),
    timestamp: new Date().toISOString(),
  }, { headers: { "cache-control": "no-store" } });
}
