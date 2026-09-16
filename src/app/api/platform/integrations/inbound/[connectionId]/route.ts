import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { receivePlatformIntegrationWebhook } from "@/lib/platform/integration-inbound";
import { respondPlatformIntegrationError } from "@/lib/platform/integration-framework-api";

export async function POST(request: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  try {
    const { connectionId } = await params;
    const correlationId = request.headers.get("x-correlation-id");
    const rawBody = await request.text();
    const explicitIdempotencyKey = request.headers.get("x-trace-idempotency-key") ?? request.headers.get("idempotency-key");
    const idempotencyKey = explicitIdempotencyKey ?? `sha256:${createHash("sha256").update(rawBody, "utf8").digest("hex")}`;
    const data = await receivePlatformIntegrationWebhook({ connectionId, rawBody, headers: request.headers, idempotencyKey, correlationId });
    return NextResponse.json({ data }, { status: data.duplicate ? 200 : 202 });
  } catch (error) {
    return respondPlatformIntegrationError(error);
  }
}
