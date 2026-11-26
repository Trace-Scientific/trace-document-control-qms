import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { AuthorizationContext } from "@/lib/security/authorization";
import { GET } from "./route";

const { authenticate, list } = vi.hoisted(() => ({
  authenticate: vi.fn<() => Promise<AuthorizationContext>>(), list: vi.fn(),
}));
vi.mock("@/lib/security/authenticated-request", () => ({
  authenticateRequest: authenticate, AuthenticationRequiredError: class extends Error {},
}));
vi.mock("@/lib/training/competency-requirements-store", () => ({ listCompetencyRequirements: list }));

const context: AuthorizationContext = {
  organizationId: "19edf975-eb67-47f2-b3bf-b8d20653e72c", userId: "8e9e58da-a20e-48f8-8576-9ad5332a233f", userState: "ACTIVE",
  grants: ["training.read", "personnel.read"].map(permission => ({ permission, scopeType: "ORGANIZATION", scopeId: null })),
};
const request = () => new NextRequest("https://qms.example.test/api/training/competency/coverage?organizationId=ignored");

beforeEach(() => {
  authenticate.mockReset().mockResolvedValue(context);
  list.mockReset().mockResolvedValue({ rows: [] });
});

it("requires personnel read and training read access", async () => {
  authenticate.mockResolvedValue({ ...context, grants: context.grants.filter(grant => grant.permission === "training.read") });
  expect((await GET(request())).status).toBe(403);
  expect(list).not.toHaveBeenCalled();
});

it("uses the session tenant and returns a dated, noncached report without management targets", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ asOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), data: [] });
  expect(list).toHaveBeenCalledWith(context.organizationId, false);
});
