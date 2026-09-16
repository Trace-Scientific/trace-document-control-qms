import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { receivePlatformIntegrationWebhook } from "@/lib/platform/integration-inbound";
import { respondPlatformIntegrationError } from "@/lib/platform/integration-framework-api";

const MAX_WEBHOOK_BYTES = 2 * 1024 * 1024;

function collectFormParameters(contentType: string | null, rawBodyText: string) {
  if (!contentType?.toLowerCase().startsWith("application/x-www-form-urlencoded")) return undefined;
  const grouped: Record<string, string[]> = {};
  for (const [key, value] of new URLSearchParams(rawBodyText)) {
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(value);
  }
  return grouped;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  try {
    const { connectionId } = await params;
    const correlationId = request.headers.get("x-correlation-id");
    const rawBodyBytes = new Uint8Array(await request.arrayBuffer());
    if (rawBodyBytes.byteLength > MAX_WEBHOOK_BYTES) {
      return NextResponse.json({ error: "Webhook payload is too large" }, { status: 413 });
    }
    const rawBody = new TextDecoder("utf-8", { fatal: false }).decode(rawBodyBytes);
    const explicitIdempotencyKey = request.headers.get("x-trace-idempotency-key") ?? request.headers.get("idempotency-key");
    const idempotencyKey = explicitIdempotencyKey ?? `sha256:${createHash("sha256").update(rawBodyBytes).digest("hex")}`;
    const data = await receivePlatformIntegrationWebhook({
      connectionId,
      rawBody,
      rawBodyBytes,
      requestUrl: request.url,
      formParameters: collectFormParameters(request.headers.get("content-type"), rawBody),
      headers: request.headers,
      idempotencyKey,
      correlationId,
    });
    return NextResponse.json({ data }, { status: data.duplicate ? 200 : 202 });
  } catch (error) {
    return respondPlatformIntegrationError(error);
  }
}
