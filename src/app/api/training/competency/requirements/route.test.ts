import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { AuthorizationContext } from "@/lib/security/authorization";
import { GET, POST } from "./route";

const { authenticate, list, create, retire } = vi.hoisted(() => ({
  authenticate: vi.fn<() => Promise<AuthorizationContext>>(),
  list: vi.fn(),
  create: vi.fn(),
  retire: vi.fn(),
}));

vi.mock("@/lib/security/authenticated-request", () => ({
  authenticateRequest: authenticate,
  AuthenticationRequiredError: class extends Error {},
}));
vi.mock("@/lib/training/competency-requirements-store", () => ({
  listCompetencyRequirements: list,
  createCompetencyRequirement: create,
  retireCompetencyRequirement: retire,
}));

const manager: AuthorizationContext = {
  organizationId: "19edf975-eb67-47f2-b3bf-b8d20653e72c",
  userId: "387bac9d-a92f-4d34-8f89-3b539ddb2232",
  userState: "ACTIVE",
  grants: ["training.read", "training.manage", "personnel.read"].map((permission) => ({ permission, scopeType: "ORGANIZATION", scopeId: null })),
};
const requestUrl = "https://qms.example.test/api/training/competency/requirements";
const input = {
  operation: "CREATE", programId: "20f20594-7dbf-472e-bc0b-0e480cf07a63",
  scope: "EMPLOYEE", targetId: "7474ce23-21ad-4fa0-bdf1-7332117e9fe1",
};

function request(body: unknown, contentType = "application/json") {
  return new NextRequest(requestUrl, {
    method: "POST", headers: { "content-type": contentType }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authenticate.mockReset().mockResolvedValue(manager);
  list.mockReset().mockResolvedValue({});
  create.mockReset().mockResolvedValue({});
  retire.mockReset().mockResolvedValue({});
});

it("limits read-only users to a tenant-scoped matrix without rule target choices or writes", async () => {
  authenticate.mockResolvedValue({ ...manager, grants: manager.grants.filter((grant) => grant.permission !== "training.manage") });
  expect((await GET(new NextRequest(requestUrl))).status).toBe(200);
  expect(list).toHaveBeenCalledWith(manager.organizationId, false);
  expect((await POST(request(input))).status).toBe(403);
  expect((await POST(request({ operation: "RETIRE", requirementId: input.targetId, reason: "test" }))).status).toBe(403);
  expect(create).not.toHaveBeenCalled();
  expect(retire).not.toHaveBeenCalled();
});

it("derives the organization and audit actor from the session", async () => {
  expect((await POST(request({ ...input, organizationId: "another tenant", actorUserId: "another user" }))).status).toBe(201);
  expect(create).toHaveBeenCalledWith(expect.objectContaining({
    programId: input.programId, targetId: input.targetId, organizationId: manager.organizationId, actorUserId: manager.userId,
  }));
});

it("requires a retirement reason and accepts JSON only", async () => {
  const retirement = { operation: "RETIRE", requirementId: input.targetId, reason: " " };
  expect((await POST(request(retirement))).status).toBe(422);
  expect((await POST(request(input, "text/plain"))).status).toBe(415);
  expect(retire).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});

it("preserves the personnel visibility boundary for employee labels and rule targets", async () => {
  authenticate.mockResolvedValue({ ...manager, grants: manager.grants.filter((grant) => grant.permission !== "personnel.read") });
  expect((await GET(new NextRequest(requestUrl))).status).toBe(403);
  expect((await POST(request(input))).status).toBe(403);
  expect(list).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});
