import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
import type { AuthorizationContext } from "@/lib/security/authorization";
import { AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { POST } from "./route";

const { db, authenticate, query, audit } = vi.hoisted(() => ({
  db: { $transaction: vi.fn() },
  authenticate: vi.fn<() => Promise<AuthorizationContext>>(),
  query: vi.fn<(statement: Prisma.Sql) => Promise<{ id: string; attemptCount: number }[]>>(),
  audit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db", () => ({ db }));
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
const decision = {
  deliveryId: "26db892d-5677-4b58-8a0e-d5fc4cae16b0",
  disposition: "OUTCOME_UNCONFIRMED",
};

function request(body: unknown = decision, contentType = "application/json") {
  return new NextRequest("https://qms.example.test/api/training/notification-review", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authenticate.mockReset().mockResolvedValue(manager);
  query.mockReset().mockResolvedValue([{ id: decision.deliveryId, attemptCount: 2 }]);
  audit.mockReset().mockResolvedValue(undefined);
  db.$transaction.mockReset().mockImplementation((operation) => operation({
    $queryRaw: query,
    auditEvent: { create: audit },
  }));
});

test("denies unauthenticated and non-manager requests before opening a transaction", async () => {
  authenticate.mockRejectedValueOnce(new AuthenticationRequiredError());
  expect((await POST(request())).status).toBe(401);

  authenticate.mockResolvedValueOnce({ ...manager, grants: [] });
  expect((await POST(request())).status).toBe(403);
  expect(db.$transaction).not.toHaveBeenCalled();
});

test("rejects simple cross-origin form content types", async () => {
  expect((await POST(request(decision, "text/plain"))).status).toBe(415);
  expect(db.$transaction).not.toHaveBeenCalled();
});

test.each([
  { ...decision, organizationId: "another-tenant" },
  { ...decision, disposition: "RETRY" },
  { ...decision, deliveryId: "invalid" },
  { ...decision, notes: "unstructured provider data" },
])("rejects invalid or unexpected decision fields", async (body) => {
  expect((await POST(request(body))).status).toBe(422);
  expect(db.$transaction).not.toHaveBeenCalled();
});

test("closes the active review and records the manager's decision in the same transaction", async () => {
  expect((await POST(request())).status).toBe(204);
  const statement = query.mock.calls[0][0];
  expect(statement.values).toEqual([manager.organizationId, decision.deliveryId]);
  expect(statement.text).toContain(`SET "status" = 'REVIEW_CLOSED'`);
  expect(statement.text).toContain(`AND "status" = 'REVIEW_REQUIRED'`);
  expect(audit).toHaveBeenCalledExactlyOnceWith({
    data: {
      organizationId: manager.organizationId,
      actorUserId: manager.userId,
      action: "TRAINING_NOTIFICATION_REVIEW_CLOSED",
      entityType: "TrainingRenewalNotificationDelivery",
      entityId: decision.deliveryId,
      metadata: { disposition: decision.disposition, attemptCount: 2 },
    },
  });
});

test("returns the same conflict for closed, foreign, and missing reviews", async () => {
  query.mockResolvedValue([]);

  expect((await POST(request())).status).toBe(409);
  expect(audit).not.toHaveBeenCalled();
});
