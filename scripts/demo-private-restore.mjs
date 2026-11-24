import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyPrivateBackup } from "./demo-private-backup-integrity.mjs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const archivePattern = /^trace-qms-demo-[0-9]{8}T[0-9]{6}Z\.backup$/;
const maxFileBytes = 25 * 1024 * 1024;

async function readMetadata(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.size > 16 * 1024 * 1024) {
    throw new Error("Invalid private restore metadata file");
  }
  return JSON.parse(await readFile(path, "utf8"));
}

export async function readPairedInventory({ archive, manifestPath, inventoryPath }) {
  const rows = await readMetadata(inventoryPath);
  const manifest = await readMetadata(manifestPath);
  if (!archivePattern.test(archive) || !Array.isArray(rows) || rows.length === 0 ||
      !manifest || Object.keys(manifest).length !== 2 || manifest.archive !== archive ||
      !Array.isArray(manifest.files) || manifest.files.length !== rows.length) {
    throw new Error("Private restore manifest does not match the selected archive and inventory");
  }

  const seen = new Set();
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row.id !== "string" || !uuid.test(row.id) || seen.has(row.id) ||
        typeof row.organizationId !== "string" || !uuid.test(row.organizationId) ||
        typeof row.originalName !== "string" || !row.originalName ||
        /[\\/\x00-\x1f]/.test(row.originalName) ||
        row.originalName === "." || row.originalName === ".." ||
        row.storageKey !== [row.organizationId, row.id, row.originalName].join("/") ||
        typeof row.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(row.sha256) ||
        !Number.isSafeInteger(row.sizeBytes) || row.sizeBytes < 0 || row.sizeBytes > maxFileBytes) {
      throw new Error("Invalid private restore inventory metadata");
    }
    const entry = manifest.files[index];
    if (!entry || Object.keys(entry).length !== 3 || entry.id !== row.id ||
        entry.sizeBytes !== row.sizeBytes || entry.sha256 !== row.sha256) {
      throw new Error("Private restore manifest does not match the restored database inventory");
    }
    seen.add(row.id);
  }
  return rows;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, archive] = process.argv.slice(2);
  const expected = await readPairedInventory({
    archive, manifestPath: "manifest.json", inventoryPath: "inventory.json",
  });
  if (mode === "list") {
    for (const row of expected) console.log(row.id);
  } else if (mode === "verify") {
    const result = await verifyPrivateBackup({ archive, expected, directory: join(process.cwd(), "objects") });
    console.log("PASS: manifest reconciled with restored database; verified files:", result.files.length);
  } else {
    throw new Error("Unknown private restore validation mode");
  }
}
