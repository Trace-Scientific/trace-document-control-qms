import { createHash } from "node:crypto";
import { DEMO_DOCUMENTS, DEMO_DOCUMENT_TYPES, validateDemoManifest } from "./demo-tenant-manifest.mjs";

export function demoDraftContent(document) {
  return [
    "SYNTHETIC DEMONSTRATION ONLY - NOT FOR CLINICAL USE",
    `Document: ${document.documentNumber} - ${document.title}`,
    "Purpose: Illustrate controlled QMS document drafting and review.",
    "Scope: Fictional Trace Scientific Demo Laboratory operations.",
    "Responsibilities: Assigned demo author, reviewer, and approver.",
    "Procedure: This is illustrative training content, not a validated laboratory procedure.",
    "Records: Demonstration records only; no patient or production data.",
    "Revision history: Initial fictional draft, revision 0.1.",
  ].join("\n\n");
}

export async function planDemoDrafts(db, organizationId) {
  validateDemoManifest();
  if (!organizationId) throw new Error("Explicit organization ID required");
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org || org.loginCode !== "trace-demo-lab" || org.active !== true) {
    throw new Error("Only an activated, explicitly identified demo organization is eligible");
  }
  const types = await db.documentType.findMany({
    where: { organizationId },
    select: { id: true, code: true },
  });
  const typeMap = new Map(types.map((type) => [type.code, type.id]));
  for (const type of DEMO_DOCUMENT_TYPES) {
    if (!typeMap.has(type.code)) throw new Error(`Missing demo document type: ${type.code}`);
  }
  const existing = await db.document.findMany({
    where: { organizationId, documentNumber: { in: DEMO_DOCUMENTS.map((doc) => doc.documentNumber) } },
    select: { documentNumber: true },
  });
  const occupied = new Set(existing.map((doc) => doc.documentNumber));
  return DEMO_DOCUMENTS.map((doc) => ({
    ...doc,
    documentTypeId: typeMap.get(doc.documentTypeCode),
    action: occupied.has(doc.documentNumber) ? "SKIP_EXISTING" : "CREATE_DRAFT",
  }));
}

export async function populateDemoDrafts({ db, service, context, apply = false }) {
  if (!context || context.userState !== "ACTIVE" || !context.organizationId) {
    throw new Error("An authenticated active demo actor is required");
  }
  if (!context.grants?.some((grant) => grant.permission === "document.create" && grant.scopeType === "ORGANIZATION" && grant.scopeId === null)) {
    throw new Error("Demo actor lacks organization-wide document.create");
  }
  const plan = await planDemoDrafts(db, context.organizationId);
  if (!apply) return { applied: false, plan };
  const results = [];
  for (const entry of plan) {
    if (entry.action === "SKIP_EXISTING") {
      results.push({ documentNumber: entry.documentNumber, status: "SKIPPED" });
      continue;
    }
    const contentText = demoDraftContent(entry);
    const created = await service.createDraft(context, {
      organizationId: context.organizationId,
      documentTypeId: entry.documentTypeId,
      documentNumber: entry.documentNumber,
      title: `[SYNTHETIC] ${entry.title}`,
      versionNumber: 1,
      revisionLabel: "0.1",
      contentHash: createHash("sha256").update(contentText).digest("hex"),
      contentText,
      changeSummary: "Initial fictional demonstration draft",
    });
    results.push({ documentNumber: entry.documentNumber, status: "CREATED", versionId: created.id });
  }
  return { applied: true, results };
}
