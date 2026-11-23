import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
import type { AuthorizationContext, RoleGrant } from "@/lib/security/authorization";
import { GET } from "./route";

const { authenticate, query } = vi.hoisted(() => ({
  authenticate: vi.fn<() => Promise<AuthorizationContext>>(),
  query: vi.fn(async () => []),
}));

vi.mock("@/lib/security/authenticated-request", () => ({
  authenticateRequest: authenticate,
  AuthenticationRequiredError: class extends Error {},
}));
vi.mock("@/lib/db", () => ({
  db: {
    organization: { findUniqueOrThrow: vi.fn(async () => ({ displayName: "Demo", loginCode: "demo" })) },
    site: { findMany: query },
    department: { findMany: query },
    user: { findMany: query },
    role: { findMany: query },
    permission: { findMany: query },
    documentType: { findMany: query },
    $queryRaw: query,
  },
}));

const request = new NextRequest("https://qms.example.test/api/admin");
const organizationId = "19edf975-eb67-47f2-b3bf-b8d20653e72c";
function grant(permission: string): RoleGrant {
  return { permission, scopeType: "ORGANIZATION", scopeId: null };
}

function signIn(grants: RoleGrant[]) {
  authenticate.mockResolvedValue({
    organizationId,
    userId: "387bac9d-a92f-4d34-8f89-3b539ddb2232",
    userState: "ACTIVE",
    grants,
  });
}

beforeEach(() => {
  authenticate.mockReset();
  query.mockClear();
});

test("administration still requires its existing organization permission", async () => {
  signIn([grant("training.manage"), grant("personnel.read")]);
  expect((await GET(request)).status).toBe(403);
  expect(query).not.toHaveBeenCalled();
});

test.each([
  ["both organization permissions", [grant("training.manage"), grant("personnel.read")], true],
  ["training permission only", [grant("training.manage")], false],
  ["personnel permission only", [grant("personnel.read")], false],
  ["site-scoped training permission", [{ permission: "training.manage", scopeType: "SITE", scopeId: "site-1" }, grant("personnel.read")], false],
] as const)("reports whether linking can be shown with %s", async (_name, grants, allowed) => {
  signIn([grant("administration.manage"), ...grants]);
  const response = await GET(request);
  expect(response.status).toBe(200);
  expect((await response.json()).data.canLinkTrainingEmployees).toBe(allowed);
});
