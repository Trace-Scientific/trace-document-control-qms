import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const archivePattern = /^trace-qms-demo-[0-9]{8}T[0-9]{6}Z\.backup$/;

// Expected metadata must come from the paired restored database, not object listing.
export async function verifyPrivateBackup({ archive, expected, directory }) {
  if (!archivePattern.test(archive) || !Array.isArray(expected)) {
    throw new Error("Invalid demo backup metadata");
  }
  const seen = new Set();
  const files = [];
  for (const row of expected) {
    if (!uuid.test(row.id) || seen.has(row.id) ||
        !/^[0-9a-f]{64}$/.test(row.sha256) ||
        !Number.isSafeInteger(row.sizeBytes) || row.sizeBytes < 0) {
      throw new Error("Invalid or duplicate file metadata");
    }
    seen.add(row.id);
    const path = join(directory, row.id);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.size !== row.sizeBytes) {
      throw new Error("Private backup file type or size mismatch");
    }
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    if (hash.digest("hex") !== row.sha256) {
      throw new Error("Private backup SHA-256 mismatch");
    }
    files.push({ id: row.id, sizeBytes: row.sizeBytes, sha256: row.sha256 });
  }
  const entries = await readdir(directory);
  if (entries.length !== seen.size || entries.some((id) => !seen.has(id))) {
    throw new Error("Unexpected private backup directory contents");
  }
  return { archive, files: files.sort((a, b) => a.id.localeCompare(b.id)) };
}
