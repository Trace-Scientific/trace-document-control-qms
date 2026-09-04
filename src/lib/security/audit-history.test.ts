import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/app/api/audit/route.ts", "utf8");
const viewer = readFileSync("src/components/audit-history.tsx", "utf8");
const administration = readFileSync("src/components/access-administration.tsx", "utf8");

describe("audit history viewer boundary", () => {
  it("requires authenticated audit.read authorization", () => {
    expect(route).toContain("authenticateRequest(request)");
    expect(route).toContain('permission: "audit.read"');
  });

  it("binds audit history and pagination cursors to the session tenant", () => {
    expect(route).toContain("organizationId: context.organizationId");
    expect(route).toContain("where: { id: cursor, organizationId: context.organizationId }");
    expect(route).toContain('error: "Invalid audit cursor"');
  });

  it("exposes required evidence fields without a mutation handler", () => {
    for (const field of [
      "occurredAt",
      "action",
      "entityType",
      "entityId",
      "entityVersion",
      "previousHash",
      "newHash",
      "reason",
      "metadata",
    ]) expect(route).toContain(`${field}: true`);
    expect(route).toContain("actor: {");
    expect(route).toContain("firstName: true");
    expect(route).toContain("lastName: true");
    expect(route).toContain("email: true");
    expect(route).not.toContain("export async function POST");
    expect(route).not.toContain("auditEvent.update");
    expect(route).not.toContain("auditEvent.delete");
  });

  it("supports bounded pagination and practical audit filters", () => {
    expect(route).toContain("const MAX_LIMIT = 100");
    expect(route).toContain('params.get("action")');
    expect(route).toContain('params.get("entityType")');
    expect(route).toContain('params.get("from")');
    expect(route).toContain('params.get("to")');
    expect(route).toContain("nextCursor");
  });

  it("renders the audit viewer from Administration and uses the supported API", () => {
    expect(administration).toContain('import { AuditHistory } from "./audit-history"');
    expect(administration).toContain("<AuditHistory />");
    expect(viewer).toContain("/api/audit?");
    expect(viewer).toContain("Audit history");
    expect(viewer).toContain("Authorized, tenant-scoped, append-only evidence");
    expect(viewer).toContain("Previous");
    expect(viewer).toContain("Next");
  });
});
