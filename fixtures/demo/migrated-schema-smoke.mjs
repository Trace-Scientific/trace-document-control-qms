// Isolated migrated-schema fixture smoke test. NEVER use Railway or production.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const expected = "postgresql://trace_qms_test:local_integration_test_only@127.0.0.1:5433/trace_qms_integration_test?schema=public";
assert.equal(process.env.RUN_DEMO_FIXTURE_INTEGRATION, "1", "Explicit integration opt-in required");
assert.equal(process.env.DATABASE_URL, expected, "Refusing non-disposable database target");
const root = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
const db = new PrismaClient({ datasources: { db: { url: expected } } });
const marker = "EXPECTED_FIXTURE_ROLLBACK";
let createdIds = [];
try {
  const identity = await db.$queryRawUnsafe("SELECT current_database() AS name, current_user AS username");
  assert.equal(identity[0].name, "trace_qms_integration_test");
  assert.equal(identity[0].username, "trace_qms_test");
  await assert.rejects(
    db.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: {
        loginCode: "fixture-smoke-isolated", legalName: "Fictional Fixture Smoke Organization",
        displayName: "Synthetic Fixture Smoke", active: false
      }});
      const author = await tx.user.create({ data: {
        organizationId: org.id, email: "fixture-author@example.invalid",
        firstName: "Synthetic", lastName: "Author", status: "ACTIVE"
      }});
      const type = await tx.documentType.create({ data: {
        organizationId: org.id, code: "DEMO", name: "Synthetic Demo Documents"
      }});
      for (const item of manifest.documents) {
        const contentText = readFileSync(resolve(root, item.path), "utf8");
        assert(contentText.includes("SYNTHETIC — DEMONSTRATION ONLY — NOT FOR LABORATORY USE"));
        const contentHash = createHash("sha256").update(contentText).digest("hex");
        const doc = await tx.document.create({ data: {
          organizationId: org.id, documentTypeId: type.id,
          documentNumber: item.id, title: item.title + " — DEMO"
        }});
        const version = await tx.documentVersion.create({ data: {
          organizationId: org.id, documentId: doc.id, authoredByUserId: author.id,
          versionNumber: 1, revisionLabel: item.revision,
          contentHash, contentText, changeSummary: "Initial fictional demonstration draft"
        }});
        assert.equal(version.status, "DRAFT");
        await tx.auditEvent.create({ data: {
          organizationId: org.id, actorUserId: author.id,
          action: "DOCUMENT_DRAFT_CREATED", entityType: "DocumentVersion",
          entityId: version.id, metadata: { documentId: doc.id, contentHash, synthetic: true }
        }});
        createdIds.push(doc.id);
      }
      assert.equal(createdIds.length, 6);
      assert.equal(await tx.document.count({ where: { organizationId: org.id } }), 6);
      assert.equal(await tx.auditEvent.count({ where: { organizationId: org.id, action: "DOCUMENT_DRAFT_CREATED" } }), 6);
      throw new Error(marker); // Always roll back even after all assertions pass.
    }),
    (error) => error instanceof Error && error.message === marker
  );
  assert.equal(await db.organization.count({ where: { loginCode: "fixture-smoke-isolated" } }), 0);
  assert.equal(await db.document.count({ where: { id: { in: createdIds } } }), 0);
  console.log("PASS: six synthetic drafts and audit rows fit migrated schema; all writes rolled back");
} finally {
  await db.$disconnect();
}
