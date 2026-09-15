import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const queryRoute = readFileSync("src/app/api/admin/route.ts", "utf8");
const commandRoute = readFileSync("src/app/api/admin/commands/route.ts", "utf8");

describe("access administration boundary", () => {
  it("requires an authenticated administration grant for reads and changes", () => {
    for (const source of [queryRoute, commandRoute]) {
      expect(source).toContain("authenticateRequest(request)");
      expect(source).toContain('permission: "administration.manage"');
      expect(source).toContain('error.message === "Access denied"');
      expect(source).toContain("status: 403");
    }
  });

  it("binds administered records to the session organization", () => {
    expect(queryRoute.split("context.organizationId").length - 1).toBeGreaterThan(5);
    expect(commandRoute.split("context.organizationId").length - 1).toBeGreaterThan(10);
    expect(commandRoute).not.toContain("input.organizationId");
  });

  it("prevents user-specific administration responses from being cached across sessions", () => {
    expect(queryRoute).toContain("cache-control");
    expect(queryRoute).toContain("private, no-store");
    expect(queryRoute).toContain("vary");
    expect(queryRoute).toContain("Cookie");
  });

  it("records each accepted command as an audit event", () => {
    expect(commandRoute).toContain("tx.auditEvent.create");
    expect(commandRoute).toContain("actorUserId: context.userId");
  });
});
