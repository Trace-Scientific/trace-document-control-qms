import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import type { AuthorizationContext } from "@/lib/security/authorization";
import { cliaCompetencyMethods } from "@/lib/training/clia-competency-methods";
import { POST } from "./route";

const { authenticate, write } = vi.hoisted(() => ({
  authenticate: vi.fn<() => Promise<AuthorizationContext>>(),
  write: vi.fn(),
}));

vi.mock("@/lib/security/authenticated-request", () => ({
  authenticateRequest: authenticate,
  AuthenticationRequiredError: class extends Error {},
}));
vi.mock("@/lib/training/competency-store", () => ({
  PrismaCompetencyStore: class { createCliaTemplate = write; },
}));

const manager: AuthorizationContext = {
  organizationId: "19edf975-eb67-47f2-b3bf-b8d20653e72c",
  userId: "387bac9d-a92f-4d34-8f89-3b539ddb2232",
  userState: "ACTIVE",
  grants: [{ permission: "training.manage", scopeType: "ORGANIZATION", scopeId: null }],
};
const programId = "20f20594-7dbf-472e-bc0b-0e480cf07a63";

function request(body: unknown, contentType = "application/json") {
  return new NextRequest("https://qms.example.test/api/training/competency/elements/clia-template", {
    method: "POST", headers: { "content-type": contentType }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authenticate.mockReset().mockResolvedValue(manager);
  write.mockReset().mockResolvedValue([]);
});

it("derives the tenant and audit actor from the authenticated session", async () => {
  const response = await POST(request({ programId, organizationId: "another-tenant", elements: cliaCompetencyMethods }));
  expect(response.status).toBe(201);
  expect(write).toHaveBeenCalledWith(expect.objectContaining({
    organizationId: manager.organizationId, actorUserId: manager.userId, programId,
  }));
});

it("rejects unauthenticated requests before writing", async () => {
  authenticate.mockRejectedValue(new AuthenticationRequiredError());
  expect((await POST(request({ programId, elements: cliaCompetencyMethods }))).status).toBe(401);
  expect(write).not.toHaveBeenCalled();
});

it("rejects read-only users and incomplete templates", async () => {
  authenticate.mockResolvedValueOnce({
    ...manager, grants: [{ permission: "training.read", scopeType: "ORGANIZATION", scopeId: null }],
  });
  expect((await POST(request({ programId, elements: cliaCompetencyMethods }))).status).toBe(403);
  expect((await POST(request({ programId, elements: cliaCompetencyMethods.slice(1) }))).status).toBe(422);
  expect(write).not.toHaveBeenCalled();
});

it("rejects a simple form-compatible content type before writing", async () => {
  expect((await POST(request({ programId, elements: cliaCompetencyMethods }, "text/plain"))).status).toBe(415);
  expect(write).not.toHaveBeenCalled();
});
