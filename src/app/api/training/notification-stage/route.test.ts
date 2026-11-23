import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import type { AuthorizationContext } from "@/lib/security/authorization";
import { POST } from "./route";

const { authenticate, run, db } = vi.hoisted(() => ({
  authenticate: vi.fn<() => Promise<AuthorizationContext>>(),
  run: vi.fn(),
  db: {},
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/security/authenticated-request", () => ({
  authenticateRequest: authenticate,
  AuthenticationRequiredError: class extends Error {},
}));
vi.mock("@/lib/training/notification-staging-runner", () => ({ runTrainingReminderStaging: run }));

const manager: AuthorizationContext = {
  organizationId: "19edf975-eb67-47f2-b3bf-b8d20653e72c",
  userId: "387bac9d-a92f-4d34-8f89-3b539ddb2232",
  userState: "ACTIVE",
  grants: [{ permission: "training.manage", scopeType: "ORGANIZATION", scopeId: null }],
};

function request(body = "{}", contentType = "application/json", search = "") {
  return new NextRequest(`https://qms.example.test/api/training/notification-stage${search}`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}

beforeEach(() => {
  authenticate.mockReset().mockResolvedValue(manager);
  run.mockReset().mockResolvedValue({ runId: "run-1", stagedCount: 2 });
});

test("requires a signed-in organization-wide training manager", async () => {
  authenticate.mockRejectedValueOnce(new AuthenticationRequiredError());
  expect((await POST(request())).status).toBe(401);

  authenticate.mockResolvedValueOnce({
    ...manager,
    grants: [{ permission: "training.manage", scopeType: "DEPARTMENT", scopeId: "department-1" }],
  });
  expect((await POST(request())).status).toBe(403);
  expect(run).not.toHaveBeenCalled();
});

test("requires JSON and rejects caller-supplied tenant, batch, and query overrides", async () => {
  expect((await POST(request("{}", "text/plain"))).status).toBe(415);
  for (const body of ['{"organizationId":"another-tenant"}', '{"batchSize":100}', "{", "[]"]) {
    expect((await POST(request(body))).status).toBe(422);
  }
  expect((await POST(request("{}", "application/json", "?organizationId=other"))).status).toBe(422);
  expect(run).not.toHaveBeenCalled();
});

test("stages one default batch for the session tenant and reports delivery as inactive", async () => {
  const response = await POST(request("{}", "application/json; charset=utf-8"));
  expect(response.status).toBe(201);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual({
    data: { runId: "run-1", stagedCount: 2 },
    mode: "staging-only",
    deliveryActive: false,
  });
  expect(run).toHaveBeenCalledExactlyOnceWith(db, manager);
});

test("returns a conflict when the runner cannot reserve the schedule", async () => {
  run.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(409);
});

test("reports unexpected errors without returning internal details", async () => {
  run.mockRejectedValue(new Error("Internal database details"));
  const response = await POST(request());
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Unable to stage training reminders" });
});
