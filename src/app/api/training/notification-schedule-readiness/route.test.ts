import type { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import type { AuthorizationContext } from "@/lib/security/authorization";
import { PUT } from "./route";

const { authenticate, transaction, execute, audit } = vi.hoisted(() => ({
  authenticate: vi.fn<() => Promise<AuthorizationContext>>(),
  transaction: vi.fn(),
  execute: vi.fn<(statement: Prisma.Sql) => Promise<number>>(),
  audit: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { $transaction: transaction } }));
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

const settings = { scheduleEnabled: true, hourUtc: 9, minimumIntervalHours: 48 };

function request(body: unknown = settings, contentType = "application/json", search = "") {
  return new NextRequest(`https://qms.example.test/api/training/notification-schedule-readiness${search}`, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authenticate.mockReset().mockResolvedValue(manager);
  transaction.mockReset().mockImplementation((run) => run({ $executeRaw: execute, auditEvent: { create: audit } }));
  execute.mockReset().mockResolvedValue(1);
  audit.mockReset().mockResolvedValue(undefined);
});

test("requires an authenticated organization-wide training manager", async () => {
  authenticate.mockRejectedValueOnce(new AuthenticationRequiredError());
  expect((await PUT(request())).status).toBe(401);
  authenticate.mockResolvedValueOnce({ ...manager, grants: [] });
  expect((await PUT(request())).status).toBe(403);
  expect(transaction).not.toHaveBeenCalled();
});

test("rejects non-JSON requests, invalid hours, and caller-supplied identity or timing overrides", async () => {
  expect((await PUT(request(settings, "text/plain"))).status).toBe(415);
  for (const body of [
    { ...settings, hourUtc: 24 }, { ...settings, minimumIntervalHours: 23 },
    { ...settings, hourUtc: 1.5 }, { ...settings, organizationId: "foreign" },
    { ...settings, lastRunAt: null }, { ...settings, deliveryActive: true },
  ]) {
    expect((await PUT(request(body))).status).toBe(422);
  }
  expect((await PUT(request(settings, "application/json", "?organizationId=foreign"))).status).toBe(422);
  expect(transaction).not.toHaveBeenCalled();
});

test("updates and audits settings for the session tenant while preserving the last run timestamp", async () => {
  const response = await PUT(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ data: settings, deliveryActive: false });
  const sql = execute.mock.calls[0][0];
  expect(sql.values).toEqual([manager.organizationId, true, 9, 48, manager.userId]);
  expect(sql.text).toContain('ON CONFLICT ("organizationId")');
  expect(sql.text).not.toContain("lastRunAt");
  expect(audit).toHaveBeenCalledExactlyOnceWith({
    data: {
      organizationId: manager.organizationId,
      actorUserId: manager.userId,
      action: "TRAINING_NOTIFICATION_SCHEDULE_UPDATED",
      entityType: "Organization",
      entityId: manager.organizationId,
      metadata: { ...settings, deliveryActive: false },
    },
  });
});

test("saving identical settings generates no duplicate audit", async () => {
  execute.mockResolvedValue(0);
  expect((await PUT(request())).status).toBe(200);
  expect(audit).not.toHaveBeenCalled();
});

test("reports a failed audit transaction as a failed save", async () => {
  audit.mockRejectedValue(new Error("Audit store unavailable"));
  const response = await PUT(request());
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Unable to save the staging schedule" });
});
