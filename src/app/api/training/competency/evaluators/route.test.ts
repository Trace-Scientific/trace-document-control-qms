import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { AuthorizationContext } from "@/lib/security/authorization";
import { GET, POST } from "./route";

const { authenticate, list, grant } = vi.hoisted(() => ({
  authenticate: vi.fn<() => Promise<AuthorizationContext>>(),
  list: vi.fn(),
  grant: vi.fn(),
}));

vi.mock("@/lib/security/authenticated-request", () => ({
  authenticateRequest: authenticate,
  AuthenticationRequiredError: class extends Error {},
}));
vi.mock("@/lib/training/competency-store", () => ({
  PrismaCompetencyStore: class { listEvaluatorAuthorizations = list; authorizeEvaluator = grant; },
}));

const programId = "20f20594-7dbf-472e-bc0b-0e480cf07a63";
const employeeId = "7474ce23-21ad-4fa0-bdf1-7332117e9fe1";
const fileId = "387bac9d-a92f-4d34-8f89-3b539ddb2232";
const context: AuthorizationContext = {
  organizationId: "19edf975-eb67-47f2-b3bf-b8d20653e72c",
  userId: "8e9e58da-a20e-48f8-8576-9ad5332a233f",
  userState: "ACTIVE",
  grants: ["training.manage", "personnel.manage"].map((permission) => ({ permission, scopeType: "ORGANIZATION", scopeId: null })),
};
const url = "https://qms.example.test/api/training/competency/evaluators";
const input = { operation: "AUTHORIZE", programId, employeeId, fileId, basis: "Written designation" };

function request(body: unknown) {
  return new NextRequest(url, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authenticate.mockReset().mockResolvedValue(context);
  list.mockReset();
  grant.mockReset().mockResolvedValue({ id: programId });
});

it("requires personnel management in addition to training management", async () => {
  authenticate.mockResolvedValue({ ...context, grants: context.grants.filter((grant) => grant.permission === "training.manage") });
  expect((await GET(new NextRequest(`${url}?programId=${programId}`))).status).toBe(403);
  expect((await POST(request(input))).status).toBe(403);
  expect(list).not.toHaveBeenCalled();
  expect(grant).not.toHaveBeenCalled();
});

it("binds the authorization to the authenticated tenant and administrator", async () => {
  expect((await POST(request({ ...input, organizationId: "supplied tenant", actorUserId: "supplied actor" }))).status).toBe(201);
  expect(grant).toHaveBeenCalledWith(expect.objectContaining({
    programId, employeeId, fileId, organizationId: context.organizationId, actorUserId: context.userId,
  }));
});

it("requires written evidence and a nonblank basis", async () => {
  expect((await POST(request({ ...input, fileId: null, basis: " " }))).status).toBe(422);
  expect(grant).not.toHaveBeenCalled();
});
