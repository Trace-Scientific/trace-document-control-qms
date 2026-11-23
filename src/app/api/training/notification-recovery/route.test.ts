import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import type { AuthorizationContext } from "@/lib/security/authorization";
import { POST } from "./route";

const { authenticate, recover, transaction, tx } = vi.hoisted(() => ({
  authenticate: vi.fn<() => Promise<AuthorizationContext>>(),
  recover: vi.fn(),
  transaction: vi.fn(),
  tx: {},
}));

vi.mock("@/lib/db", () => ({ db: { $transaction: transaction } }));
vi.mock("@/lib/security/authenticated-request", () => ({
  authenticateRequest: authenticate,
  AuthenticationRequiredError: class extends Error {},
}));
vi.mock("@/lib/training/notification-claims", () => ({ quarantineStaleTrainingRenewalClaims: recover }));

const manager: AuthorizationContext = {
  organizationId: "19edf975-eb67-47f2-b3bf-b8d20653e72c",
  userId: "387bac9d-a92f-4d34-8f89-3b539ddb2232",
  userState: "ACTIVE",
  grants: [{ permission: "training.manage", scopeType: "ORGANIZATION", scopeId: null }],
};

function request(body = "{}", contentType = "application/json", search = "") {
  return new NextRequest(`https://qms.example.test/api/training/notification-recovery${search}`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}

beforeEach(() => {
  authenticate.mockReset().mockResolvedValue(manager);
  recover.mockReset().mockResolvedValue(2);
  transaction.mockReset().mockImplementation((work) => work(tx));
});

test("requires a signed-in organization-wide training manager", async () => {
  authenticate.mockRejectedValueOnce(new AuthenticationRequiredError());
  expect((await POST(request())).status).toBe(401);

  authenticate.mockResolvedValueOnce({
    ...manager,
    grants: [{ permission: "training.manage", scopeType: "DEPARTMENT", scopeId: "department-1" }],
  });
  expect((await POST(request())).status).toBe(403);
  expect(transaction).not.toHaveBeenCalled();
});

test("requires JSON and rejects caller-supplied tenant, age, batch, and query overrides", async () => {
  expect((await POST(request("{}", "text/plain"))).status).toBe(415);
  for (const body of ['{"organizationId":"another-tenant"}', '{"olderThanMinutes":0}', '{"batchSize":100}', "{", "[]"]) {
    expect((await POST(request(body))).status).toBe(422);
  }
  expect((await POST(request("{}", "application/json", "?organizationId=other"))).status).toBe(422);
  expect(transaction).not.toHaveBeenCalled();
});

test("recovers one batch for the session tenant inside a transaction", async () => {
  const response = await POST(request("{}", "application/json; charset=utf-8"));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ data: { movedForReview: 2 } });
  expect(transaction).toHaveBeenCalledTimes(1);
  expect(recover).toHaveBeenCalledExactlyOnceWith(tx, manager.organizationId, manager.userId);
});

test("returns a zero count when nothing needs recovery", async () => {
  recover.mockResolvedValue(0);
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: { movedForReview: 0 } });
});

test("reports a failed transaction without returning internal details", async () => {
  recover.mockRejectedValue(new Error("Internal database details"));
  const response = await POST(request());
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Unable to recover interrupted reminders" });
});
