import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const queryRoute = readFileSync("src/app/api/admin/route.ts", "utf8"), commandRoute = readFileSync("src/app/api/admin/commands/route.ts", "utf8");
describe("access administration boundary", () => {
  it("requires an authenticated administration grant for reads and changes", () => { for (const source of [queryRoute, commandRoute]) { expect(source).toContain("authenticateRequest(request)"); expect(source).toContain('permission: "administration.manage"'); } });
  it("binds administered records to the session organization", () => { expect(queryRoute.match(/context\.organizationId/g)?.length).toBeGreaterThan(5); expect(commandRoute.match(/context\.organizationId/g)?.length).toBeGreaterThan(10); expect(commandRoute).not.toContain("input.organizationId"); });
  it("records each accepted command as an audit event", () => { expect(commandRoute).toContain("tx.auditEvent.create"); expect(commandRoute).toContain("actorUserId: context.userId"); });
});
