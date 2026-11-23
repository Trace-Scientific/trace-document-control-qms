import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import type { AuthorizationContext } from "@/lib/security/authorization";
import { GET } from "./route";

const { authenticate, query } = vi.hoisted(() => ({
  authenticate: vi.fn<() => Promise<AuthorizationContext>>(),
  query: vi.fn<(statement: Prisma.Sql) => Promise<unknown[]>>(),
}));

vi.mock("@/lib/db", () => ({ db: { $queryRaw: query } }));
vi.mock("@/lib/security/authenticated-request", () => ({
  authenticateRequest: authenticate,
  AuthenticationRequiredError: class extends Error {},
}));

const context: AuthorizationContext = {
  organizationId: "19edf975-eb67-47f2-b3bf-b8d20653e72c",
  userId: "387bac9d-a92f-4d34-8f89-3b539ddb2232",
  userState: "ACTIVE",
  grants: [],
};
const employee = { id: "6a949094-b01d-4832-ad73-446beaf361a6", status: "ACTIVE" };
const completionId = "26db892d-5677-4b58-8a0e-d5fc4cae16b0";

function request() {
  return new NextRequest(`https://qms.example.test/api/training/my-completion-certificate?completionId=${completionId}`);
}

beforeEach(() => {
  authenticate.mockReset().mockResolvedValue(context);
  query.mockReset().mockResolvedValueOnce([employee]).mockResolvedValue([]);
});

test("requires a signed-in learner before reading training data", async () => {
  authenticate.mockRejectedValueOnce(new AuthenticationRequiredError());

  expect((await GET(request())).status).toBe(401);
  expect(query).not.toHaveBeenCalled();
});

test("denies access without an active employee link", async () => {
  query.mockReset().mockResolvedValueOnce([{ ...employee, status: "INACTIVE" }]);

  expect((await GET(request())).status).toBe(403);
  expect(query).toHaveBeenCalledTimes(1);
});

test("uses the tenant, linked employee, and official completed assignment to locate the record", async () => {
  const response = await GET(request());

  expect(response.status).toBe(404);
  expect(query.mock.calls[0][0].values).toEqual([context.organizationId, context.userId]);
  const statement = query.mock.calls[1][0];
  expect(statement.values).toEqual([context.organizationId, employee.id, completionId]);
  expect(statement.text).toContain(`a."status"::text = 'COMPLETED'`);
  expect(statement.text).toContain('a."employeeId" = r."employeeId"');
});

test("renders a private, printable certificate with escaped record details", async () => {
  query.mockResolvedValueOnce([{
    id: completionId,
    completedAt: new Date("2026-11-23T09:00:00Z"),
    firstName: "Taylor",
    lastName: "O'Neil",
    courseTitle: "Lab <Safety> & Quality",
    courseCode: "TS-101",
    result: "Passed",
  }]);

  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("text/html");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  const html = await response.text();
  expect(html).toContain("<h1>Certificate of Training Completion</h1>");
  expect(html).toContain("Taylor O&#39;Neil");
  expect(html).toContain("Lab &lt;Safety&gt; &amp; Quality");
  expect(html).toContain("2026-11-23");
  expect(html).toContain("Recorded result: Passed");
  expect(html).toContain(completionId);
  expect(html).toContain("Print or save as PDF");
  expect(html).toContain(".print-action { display: none; }");
});
