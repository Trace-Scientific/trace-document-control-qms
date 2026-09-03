import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const commands = await readFile("src/app/api/admin/commands/route.ts", "utf8");
const adminQuery = await readFile("src/app/api/admin/route.ts", "utf8");
const administration = await readFile("src/components/access-administration.tsx", "utf8");
const documentCommands = await readFile("src/app/api/documents/commands/route.ts", "utf8");

describe("controlled document type administration contract", () => {
  it("requires administration authorization and derives tenant and actor from the session", () => {
    expect(commands).toContain('permission: "administration.manage"');
    expect(commands).toContain("organizationId: context.organizationId");
    expect(commands).toContain("actorUserId: context.userId");
    expect(commands).not.toMatch(/organizationId:\s*input\./);
  });

  it("supports audited create, review interval, and activation changes without destructive deletion", () => {
    expect(commands).toContain('z.literal("CREATE_DOCUMENT_TYPE")');
    expect(commands).toContain('z.literal("UPDATE_DOCUMENT_TYPE_REVIEW_INTERVAL")');
    expect(commands).toContain('z.literal("SET_DOCUMENT_TYPE_ACTIVE")');
    expect(commands).toContain('entityType = "DocumentType"');
    expect(commands).toContain("priorReviewMonths: row.reviewMonths");
    expect(commands).toContain("tx.auditEvent.create");
    expect(commands).not.toContain("documentType.delete");
    expect(commands).not.toContain("documentType.deleteMany");
  });

  it("validates review intervals and scopes changes to the authenticated tenant", () => {
    expect(commands).toContain("z.number().int().min(1).max(120).nullable()");
    expect(commands).toContain("id: input.documentTypeId, organizationId: context.organizationId");
    expect(commands).not.toMatch(/organizationId:\s*input\./);
  });

  it("prevents duplicate tenant codes or names and scopes activation changes to the tenant", () => {
    expect(commands).toContain('name: { equals: input.name, mode: "insensitive" }');
    expect(commands).toContain('throw new Error("Document type already exists")');
    expect(commands).toContain("id: input.documentTypeId, organizationId: context.organizationId");
  });

  it("returns document types only for the authenticated tenant", () => {
    expect(adminQuery).toContain("db.documentType.findMany");
    expect(adminQuery).toContain("where: { organizationId: context.organizationId }");
  });

  it("provides create, review interval, list, and non-destructive status controls in administration", () => {
    expect(administration).toContain('form("CREATE_DOCUMENT_TYPE"');
    expect(administration).toContain('form("UPDATE_DOCUMENT_TYPE_REVIEW_INTERVAL"');
    expect(administration).toContain("Save review interval");
    expect(administration).toContain('operation: "SET_DOCUMENT_TYPE_ACTIVE"');
    expect(administration).toContain("No document types configured. Create one above before starting a controlled document.");
  });

  it("returns actionable lifecycle configuration errors without weakening other command validation", () => {
    expect(documentCommands).toContain("error instanceof DocumentConfigurationError");
    expect(documentCommands).toContain("{ error: error.message }");
    expect(documentCommands).toContain('error: "The document command is invalid"');
  });
});
