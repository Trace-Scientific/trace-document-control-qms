import { test } from "vitest";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile, readFile } from "node:fs/promises";
import { collectPrivateBackup } from "./demo-private-backup-collection.mjs";

const bytes = Buffer.from("synthetic attachment");
const archive = "trace-qms-demo-20000101T000000Z.backup";
const organizationId = "11111111-1111-4111-8111-111111111111";
const rows = ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"].map(id => ({
  id, organizationId, loginCode: "trace-demo-lab", status: "AVAILABLE",
  originalName: "fixture.txt", storageKey: organizationId + "/" + id + "/fixture.txt",
  sizeBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
}));

test("collects multiple verified objects before publishing the paired manifest", async () => {
  const uploads = [];
  const result = await collectPrivateBackup({
    tier: "demo", archive, rows,
    download: async (key, path) => { assert.ok(rows.some(row => row.storageKey === key)); await writeFile(path, bytes); },
    publish: async ({ key, path, body }) => uploads.push({ key, body: path ? await readFile(path) : body }),
  });
  assert.equal(uploads.length, 3);
  assert.equal(uploads[0].key, "demo/private-files/" + archive + "/" + rows[0].id);
  assert.deepEqual(uploads[0].body, bytes);
  assert.equal(uploads[2].key, "demo/private-files/" + archive + "/manifest.json");
  assert.deepEqual(JSON.parse(uploads[2].body), result);
  assert.equal(result.files.length, 2);
});

test("rejects unsafe scope and incomplete transfers without publishing completion", async () => {
  const uploads = [];
  const base = { tier: "demo", archive, rows,
    download: async (_key, path) => writeFile(path, bytes),
    publish: async ({ key }) => uploads.push(key),
  };
  await assert.rejects(collectPrivateBackup({ ...base, tier: "production" }));
  await assert.rejects(collectPrivateBackup({ ...base, rows: [{ ...rows[0], loginCode: "lab-b" }] }));
  await assert.rejects(collectPrivateBackup({ ...base, rows: [{ ...rows[0], status: "QUARANTINED" }] }));
  await assert.rejects(collectPrivateBackup({ ...base, rows: [{ ...rows[0], storageKey: "other/key" }] }));
  await assert.rejects(collectPrivateBackup({ ...base, download: async () => { throw new Error("missing"); } }));
  await assert.rejects(collectPrivateBackup({ ...base, download: async (_key, path) => writeFile(path, Buffer.alloc(bytes.length)) }));
  assert.deepEqual(uploads, []);
  await assert.rejects(collectPrivateBackup({ ...base, publish: async ({ key }) => {
    uploads.push(key);
    throw new Error("transfer failed");
  } }));
  assert.equal(uploads.length, 1);
  assert.ok(!uploads[0].endsWith("manifest.json"));
});
