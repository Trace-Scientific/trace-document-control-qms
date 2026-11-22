import type { Prisma } from "@prisma/client";
import { expect, test, vi } from "vitest";
import { previewTrainingReminderQueue, stageTrainingReminderQueue } from "./notification-queue";

const organizationId = "19edf975-eb67-47f2-b3bf-b8d20653e72c";
const runId = "26db892d-5677-4b58-8a0e-d5fc4cae16b0";
const actorUserId = "387bac9d-a92f-4d34-8f89-3b539ddb2232";

function mockDb() {
  const query = vi.fn<(sql: Prisma.Sql) => Promise<unknown[]>>().mockResolvedValue([]);
  const audit = vi.fn().mockResolvedValue({ count: 1 });
  const tx = { $queryRaw: query, auditEvent: { createMany: audit } } as unknown as Prisma.TransactionClient;
  return { tx, query, audit };
}

test("preview uses the tenant's ledger identity and runs a read-only query", async () => {
  const { tx, query, audit } = mockDb();
  const counts = [{ reminderType: "DUE_7", eligible: 1n, alreadyRecorded: 2n }];
  query.mockResolvedValue(counts);

  await expect(previewTrainingReminderQueue(tx, organizationId)).resolves.toEqual(counts);
  const sql = query.mock.calls[0][0];
  expect(sql.values).toEqual(Array(5).fill(organizationId));
  expect(sql.text).toContain('d."renewalDueDate" = c."dueDate" AND d."reminderType" = c."reminderType"');
  expect(sql.text).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  expect(audit).not.toHaveBeenCalled();
});

test.each([0, 101, 1.5])("rejects out-of-range batch size %s before accessing the ledger", async (batchSize) => {
  const { tx, query } = mockDb();

  await expect(stageTrainingReminderQueue(tx, { organizationId, runId, batchSize })).rejects.toThrow("Invalid notification batch size");
  expect(query).not.toHaveBeenCalled();
});

test("enqueues only under an active tenant reservation and audits newly staged reminders", async () => {
  const { tx, query, audit } = mockDb();
  query.mockResolvedValue([{ id: "new-delivery", reminderType: "DUE_7", actorUserId }]);

  await expect(stageTrainingReminderQueue(tx, { organizationId, runId })).resolves.toBe(1);
  const sql = query.mock.calls[0][0];
  expect(sql.values).toEqual([organizationId, organizationId, organizationId, organizationId,
    organizationId, runId, organizationId, organizationId, 25]);
  expect(sql.text).toContain('s."organizationId" = r."organizationId" AND s."enabled"');
  expect(sql.text).toContain(`r."status" = 'RESERVED'`);
  expect(sql.text).toContain("FOR UPDATE OF r");
  expect(sql.text).toContain('c."reminderType" IS NOT NULL AND d."id" IS NULL');
  expect(sql.text).toContain("DO NOTHING");
  expect(audit).toHaveBeenCalledExactlyOnceWith({
    data: [{
      organizationId,
      actorUserId,
      action: "TRAINING_NOTIFICATION_STAGED",
      entityType: "TrainingRenewalNotificationDelivery",
      entityId: "new-delivery",
      metadata: { reminderType: "DUE_7", runId },
    }],
  });
});

test("a no-op stages and audits nothing", async () => {
  const { tx, audit } = mockDb();
  await expect(stageTrainingReminderQueue(tx, { organizationId, runId })).resolves.toBe(0);
  expect(audit).not.toHaveBeenCalled();
});
