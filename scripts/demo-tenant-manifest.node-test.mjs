import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_DOCUMENTS,
  DEMO_PERSONAS,
  validateDemoManifest,
} from "./demo-tenant-manifest.mjs";

test("demo manifest has stable, unique, synthetic document identifiers", () => {
  const counts = validateDemoManifest();
  assert.deepEqual(counts, {
    sites: 2,
    departments: 4,
    documentTypes: 4,
    documents: 15,
    personas: 6,
  });
  assert.ok(DEMO_DOCUMENTS.every((doc) => doc.documentNumber.startsWith("DEMO-")));
});

test("demo personas have no credentials or real email addresses", () => {
  assert.ok(DEMO_PERSONAS.every((persona) =>
    !("password" in persona) && !("email" in persona) && !("credential" in persona)
  ));
});
