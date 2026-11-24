import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { PrivateObjectStorage } from "@/lib/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const reject = (status: number) => new Response(null, { status, headers });
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest();

export async function GET(request: Request) {
  const secret = process.env.DEMO_BACKUP_EXPORT_SECRET;
  if (process.env.DEPLOYMENT_TIER !== "demo" || !secret || secret.length < 32) return reject(404);
  const supplied = request.headers.get("authorization") ?? "";
  if (!timingSafeEqual(hash(supplied), hash("Bearer " + secret))) return reject(401);
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return reject(400);
  try {
    const file = await db.fileObject.findFirst({
      where: { id, status: "AVAILABLE", organization: { loginCode: "trace-demo-lab", active: true } },
    });
    if (!file) return reject(404);
    if (file.storageKey !== [file.organizationId, file.id, file.originalName].join("/") ||
        /[\\/\x00-\x1f]/.test(file.originalName) || !file.originalName ||
        file.originalName === "." || file.originalName === "..") return reject(409);
    const bytes = await new PrivateObjectStorage().get(file.storageKey);
    if (BigInt(bytes.length) !== file.sizeBytes || hash(bytes).toString("hex") !== file.sha256) return reject(409);
    await db.auditEvent.create({ data: {
      organizationId: file.organizationId, action: "DEMO_BACKUP_FILE_EXPORTED",
      entityType: "FileObject", entityId: file.id, newHash: file.sha256,
      metadata: { service: "demo-backup-worker" },
    } });
    return new Response(Buffer.from(bytes), { headers: { ...headers, "Content-Type": "application/octet-stream" } });
  } catch {
    return reject(503);
  }
}
