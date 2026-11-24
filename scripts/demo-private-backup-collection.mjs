import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyPrivateBackup } from "./demo-private-backup-integrity.mjs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Callers must supply rows from the paired restored archive and scoped adapters.
// No live database connection or storage credentials are managed here.
export async function collectPrivateBackup({ tier, archive, rows, download, publish }) {
  if (tier !== "demo" || !/^trace-qms-demo-[0-9]{8}T[0-9]{6}Z\.backup$/.test(archive) ||
      !Array.isArray(rows)) throw new Error("Invalid demo collection scope");
  const seen = new Set();
  for (const row of rows) {
    if (row.loginCode !== "trace-demo-lab" || row.status !== "AVAILABLE" ||
        !uuid.test(row.id) || !uuid.test(row.organizationId) || seen.has(row.id) ||
        typeof row.originalName !== "string" || !row.originalName ||
        /[\\/\x00-\x1f]/.test(row.originalName) ||
        row.originalName === "." || row.originalName === ".." ||
        row.storageKey !== [row.organizationId, row.id, row.originalName].join("/") ||
        !/^[0-9a-f]{64}$/.test(row.sha256) ||
        !Number.isSafeInteger(row.sizeBytes) || row.sizeBytes < 0) {
      throw new Error("Invalid or out-of-scope private file metadata");
    }
    seen.add(row.id);
  }
  const work = await mkdtemp(join(tmpdir(), "demo-private-backup-"));
  try {
    const directory = join(work, "objects");
    await mkdir(directory, { mode: 0o700 });
    for (const row of rows) await download(row.storageKey, join(directory, row.id));
    const manifest = await verifyPrivateBackup({ archive, expected: rows, directory });
    const prefix = "demo/private-files/" + archive + "/";
    for (const row of manifest.files) {
      await publish({ key: prefix + row.id, path: join(directory, row.id) });
    }
    // Publish completion marker only after all object transfers succeed.
    await publish({ key: prefix + "manifest.json", body: JSON.stringify(manifest) + "\n" });
    return manifest;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
