import type { Prisma } from "@prisma/client";
import { expect, test, vi } from "vitest";
import { resolveTrainingReminderMessage } from "./notification-recipient";

const claim = {
  organizationId: "19edf975-eb67-47f2-b3bf-b8d20653e72c",
  deliveryId: "26db892d-5677-4b58-8a0e-d5fc4cae16b0",
  attemptCount: 2,
};
const row = { recipientEmail: " trainee@example.test ", dueDate: "2026-11-24" };

function mockReader(rows: typeof row[]) {
  const query = vi.fn<(statement: Prisma.Sql) => Promise<typeof rows>>().mockResolvedValue(rows);
  return { db: { $queryRaw: query } as unknown as Pick<Prisma.TransactionClient, "$queryRaw">, query };
}

test("constructs a minimal message from a single tenant-linked account and the current claim", async () => {
  const { db, query } = mockReader([row]);
  await expect(resolveTrainingReminderMessage(db, claim)).resolves.toEqual({
    deliveryId: claim.deliveryId,
    organizationId: claim.organizationId,
    recipientEmail: "trainee@example.test",
    subject: "Trace QMS training renewal reminder",
    text: "A training renewal is due on 2026-11-24. Sign in to Trace QMS to review your training.",
    idempotencyKey: `training-reminder:${claim.deliveryId}`,
  });
  const sql = query.mock.calls[0][0];
  expect(sql.values).toEqual([...Array(5).fill(claim.organizationId), claim.deliveryId, claim.attemptCount]);
  expect(sql.text).toContain('l."organizationId" = d."organizationId"');
  expect(sql.text).toContain('u."organizationId" = l."organizationId"');
  expect(sql.text).toContain('c."completionId" = d."completionId"');
  expect(sql.text).toContain(`d."status" = 'SENDING' AND d."attemptCount" = $7`);
  expect(sql.text).toContain(`u."status"::text = 'ACTIVE'`);
});

test.each([
  { label: "missing link", rows: [] },
  { label: "ambiguous link", rows: [row, row] },
  { label: "invalid address", rows: [{ ...row, recipientEmail: "not-an-address" }] },
])("returns no message for $label", async ({ rows }) => {
  const { db } = mockReader(rows);
  await expect(resolveTrainingReminderMessage(db, claim)).resolves.toBeNull();
});

test("rejects an invalid attempt before reading recipient data", async () => {
  const { db, query } = mockReader([row]);
  await expect(resolveTrainingReminderMessage(db, { ...claim, attemptCount: 0 })).resolves.toBeNull();
  expect(query).not.toHaveBeenCalled();
});
