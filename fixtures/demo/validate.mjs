import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, sep } from "node:path";
import assert from "node:assert/strict";

const root = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.documents.length, 6);
const ids = new Set();
const allowed = new Set(["approved", "draft"]);
for (const doc of manifest.documents) {
  assert.match(doc.id, /^(SOP|POL|FRM|WI)-[A-Z]+-[0-9]{3}$/);
  assert(!ids.has(doc.id), "Duplicate document ID: " + doc.id);
  ids.add(doc.id);
  assert.equal(doc.synthetic, true);
  assert(allowed.has(doc.status));
  assert.match(doc.revision, /^[0-9]+\.[0-9]+$/);
  assert.equal(doc.path, "documents/" + doc.id + ".md");
  const fullPath = resolve(root, doc.path);
  assert(fullPath.startsWith(root + sep), "Unsafe fixture path");
  const text = readFileSync(fullPath, "utf8");
  assert(text.startsWith("# " + doc.id + " — " + doc.title + " — DEMO"));
  assert(text.includes("SYNTHETIC — DEMONSTRATION ONLY — NOT FOR LABORATORY USE"));
  assert(text.includes("Revision: " + doc.revision));
  assert(text.includes("Planned demonstration state: " + doc.status.toUpperCase()));
  assert(text.length > 350);
  assert(!/\b(?:patient name|date of birth|medical record number|SSN)\s*:\s*\S+/i.test(text), "Potential sensitive field");
}
console.log("PASS: six unique, labeled, non-operational synthetic demo documents");
