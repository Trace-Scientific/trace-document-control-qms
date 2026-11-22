import type { Prisma, PrismaClient } from "@prisma/client";
import { beforeEach, expect, test, vi } from "vitest";
import type { AuthorizationContext } from "../security/authorization";
import { runTrainingReminderStaging } from "./notification-staging-runner";

const { reserve, stage, close } = vi.hoisted(() => ({
  reserve: vi.fn(),
  stage: vi.fn(),
  close: vi.fn(),
}));
vi.mock("./notification-queue", () => ({ stageTrainingReminderQueue: stage }));
vi.mock("./notification-schedule-runs", () => ({
  reserveTrainingNotificationScheduleRun: reserve,
  closeTrainingNotificationScheduleRun: close,
}));

const manager: AuthorizationContext = {
  organizationId: "19edf975-eb67-47f2-b3bf-b8d20653e72c",
  userId: "387bac9d-a92f-4d34-8f89-3b539ddb2232",
  userState: "ACTIVE",
  grants: [{ permission: "training.manage", scopeType: "ORGANIZATION", scopeId: null }],
};
const run = { id: "26db892d-5677-4b58-8a0e-d5fc4cae16b0", reservedAt: new Date() };

function mockDb() {
  const tx = {} as Prisma.TransactionClient;
  const transaction = vi.fn((operation: (client: Prisma.TransactionClient) => Promise<unknown>) => operation(tx));
  return { db: { $transaction: transaction } as unknown as Pick<PrismaClient, "$transaction">, transaction, tx };
}

beforeEach(() => {
  reserve.mockReset().mockResolvedValue(run);
  stage.mockReset().mockResolvedValue(2);
  close.mockReset().mockResolvedValue(true);
});

test("rejects callers without organization-wide training management permission", async () => {
  const { db, transaction } = mockDb();
  await expect(runTrainingReminderStaging(db, { ...manager, grants: [] })).rejects.toThrow("Access denied");
  expect(transaction).not.toHaveBeenCalled();
});

test("skips staging when the tenant cannot reserve a run", async () => {
  const { db } = mockDb();
  reserve.mockResolvedValue(null);
  await expect(runTrainingReminderStaging(db, manager)).resolves.toBeNull();
  expect(stage).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});

test("reserves, stages, and records closure in the same transaction", async () => {
  const { db, tx, transaction } = mockDb();
  await expect(runTrainingReminderStaging(db, manager, 10)).resolves.toEqual({ runId: run.id, stagedCount: 2 });
  expect(transaction).toHaveBeenCalledTimes(1);
  expect(reserve).toHaveBeenCalledExactlyOnceWith(tx, manager.organizationId, manager.userId);
  expect(stage).toHaveBeenCalledExactlyOnceWith(tx, { organizationId: manager.organizationId, runId: run.id, batchSize: 10 });
  expect(close).toHaveBeenCalledExactlyOnceWith(tx, {
    organizationId: manager.organizationId,
    actorUserId: manager.userId,
    runId: run.id,
    status: "FINISHED",
    claimedCount: 0,
    stagedCount: 2,
  });
});

test("rejects the transaction if staging fails or the reservation cannot be closed", async () => {
  const { db } = mockDb();
  stage.mockRejectedValueOnce(new Error("Staging audit failed"));
  await expect(runTrainingReminderStaging(db, manager)).rejects.toThrow("Staging audit failed");
  expect(close).not.toHaveBeenCalled();

  close.mockResolvedValue(false);
  await expect(runTrainingReminderStaging(db, manager)).rejects.toThrow("reservation could not be closed");
});
