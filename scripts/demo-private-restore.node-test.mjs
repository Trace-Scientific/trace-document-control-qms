import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readPairedInventory } from "./demo-private-restore.mjs";

const archive = "trace-qms-demo-20261124T192006Z.backup";
const organizationId = "32e089a4-1deb-4db1-aa29-6c9b12e3ceb1";
const originalName = "synthetic report.txt";
const rows = [
  "502d9cb2-2280-4f80-899e-e9a45f664101",
  "502d9cb2-2280-4f80-899e-e9a45f664102",
].map((id) => ({
  id, organizationId, originalName, storageKey: `${organizationId}/${id}/${originalName}`,
  sizeBytes: 10, sha256: "a".repeat(64),
}));
const manifest = {
  archive,
  files: rows.map(({ id, sizeBytes, sha256 }) => ({ id, sizeBytes, sha256 })),
};

async function fixture(t, inventory, marker) {
  const work = await mkdtemp(join(tmpdir(), "restore-metadata-"));
  t.after(() => rm(work, { recursive: true, force: true }));
  const inventoryPath = join(work, "inventory.json");
  const manifestPath = join(work, "manifest.json");
  await writeFile(inventoryPath, JSON.stringify(inventory));
  await writeFile(manifestPath, JSON.stringify(marker));
  return { archive, manifestPath, inventoryPath };
}

test("reconciles the published manifest with the restored archive's inventory", async (t) => {
  assert.deepEqual(await readPairedInventory(await fixture(t, rows, manifest)), rows);
});

for (const [name, makeInvalid] of [
  ["wrong archive", (inventory, marker) => { marker.archive = "another.backup"; }],
  ["invalid UUID", (inventory, marker) => { marker.files[0].id = "../file"; }],
  ["missing entry", (inventory, marker) => { marker.files.pop(); }],
  ["extra entry", (inventory, marker) => { marker.files.push(marker.files[0]); }],
  ["duplicate entry", (inventory, marker) => { marker.files[1] = marker.files[0]; }],
  ["reordered entry", (inventory, marker) => { marker.files.reverse(); }],
  ["mismatched size", (inventory, marker) => { marker.files[0].sizeBytes++; }],
  ["mismatched hash", (inventory, marker) => { marker.files[0].sha256 = "b".repeat(64); }],
  ["noncanonical storage key", (inventory) => { inventory[0].storageKey += "/wrong"; }],
  ["out-of-range size", (inventory, marker) => {
    inventory[0].sizeBytes = marker.files[0].sizeBytes = 25 * 1024 * 1024 + 1;
  }],
]) {
  test(`rejects ${name}`, async (t) => {
    const inventory = structuredClone(rows);
    const marker = structuredClone(manifest);
    makeInvalid(inventory, marker);
    await assert.rejects(readPairedInventory(await fixture(t, inventory, marker)), /private restore/i);
  });
}
