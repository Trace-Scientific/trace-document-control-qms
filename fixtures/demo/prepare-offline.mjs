import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Offline preparation only. No database client, network calls or write operations.
const root = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
const payloads = manifest.documents.map((doc) => {
  const contentText = readFileSync(resolve(root, doc.path), "utf8");
  const contentHash = createHash("sha256").update(contentText, "utf8").digest("hex");
  return {
    documentNumber: doc.id,
    title: doc.title + " — DEMO",
    versionNumber: 1,
    revisionLabel: doc.revision,
    contentHash,
    contentText,
    changeSummary: "Initial synthetic demo draft; not for laboratory use",
    intendedState: "DRAFT",
    plannedDemonstrationState: doc.status.toUpperCase(),
  };
});
assert.equal(payloads.length, 6);
assert.equal(new Set(payloads.map((p) => p.documentNumber)).size, 6);
for (const p of payloads) {
  assert.match(p.contentHash, /^[a-f0-9]{64}$/);
  assert.equal(createHash("sha256").update(p.contentText, "utf8").digest("hex"), p.contentHash);
  assert.equal(p.intendedState, "DRAFT");
  assert(p.contentText.includes("SYNTHETIC — DEMONSTRATION ONLY — NOT FOR LABORATORY USE"));
}
console.log("PASS: prepared six offline CreateDraftInput-compatible payloads with SHA-256 hashes; no database connection");
