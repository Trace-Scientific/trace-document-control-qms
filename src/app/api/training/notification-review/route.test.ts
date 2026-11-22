import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
import type { AuthorizationContext } from "@/lib/security/authorization";
import { AuthenticationRequiredError } from "@/lib/security/authenticated-request";
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

const manager: AuthorizationContext = {
  organizationId: "19edf975-eb67-47f2-b3bf-b8d20653e72c",
  userId: "387bac9d-a92f-4d34-8f89-3b539ddb2232",
  userState: "ACTIVE",
  grants: [{ permission: "training.manage", scopeType: "ORGANIZATION", scopeId: null }],
};

function request(search = "") {
  return new NextRequest(`https://qms.example.test/api/training/notification-review${search}`);
}

beforeEach(() => {
  authenticate.mockReset().mockResolvedValue(manager);
  query.mockReset().mockResolvedValue([]);
});

test("requires authentication before looking up deliveries", async () => {
  authenticate.mockRejectedValue(new AuthenticationRequiredError());

  expect((await GET(request())).status).toBe(401);
  expect(query).not.toHaveBeenCalled();
});

test("requires organization-wide training management permission", async () => {
  authenticate.mockResolvedValue({
    ...manager,
    grants: [
      { permission: "training.read", scopeType: "ORGANIZATION", scopeId: null },
      { permission: "training.manage", scopeType: "SITE", scopeId: "site-1" },
    ],
  });

  expect((await GET(request())).status).toBe(403);
  expect(query).not.toHaveBeenCalled();
});

test.each(["?organizationId=other", "?page=1&page=2", "?page=0", "?page=01", "?page=9007199254740992"])(
  "rejects invalid or unexpected query parameters (%s)",
  async (search) => {
    expect((await GET(request(search))).status).toBe(422);
    expect(query).not.toHaveBeenCalled();
  },
);

test("returns a bounded page of tenant-scoped review entries", async () => {
  const rows = Array.from({ length: 26 }, (_, index) => ({
    id: `delivery-${index}`,
    employeeNumber: "DEMO-001",
    courseCode: "COURSE-01",
    courseTitle: "Equipment maintenance",
    renewalDueDate: "2026-12-02",
    reminderType: "DUE_7",
    lastAttemptAt: null,
    updatedAt: new Date("2026-11-28T18:15:00Z"),
  }));
  query.mockResolvedValue(rows);

  const response = await GET(request("?page=2"));

  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual({
    data: rows.slice(0, 25).map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
    page: 2,
    hasMore: true,
  });
  const statement = query.mock.calls[0][0];
  expect(statement.values).toEqual([manager.organizationId, 26, 25]);
  expect(statement.text).toContain('d."organizationId" = $1::uuid');
  expect(statement.text).toContain(`d."status" = 'REVIEW_REQUIRED'`);
  expect(statement.text).not.toMatch(/lastError|recipientEmail/);
});

test("returns an empty first page when no reminders are flagged", async () => {
  const response = await GET(request());

  expect(await response.json()).toEqual({ data: [], page: 1, hasMore: false });
});
