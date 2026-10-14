import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformAuthorizationContext } from "./authorization";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("../db", () => ({
  db: {
    $queryRaw: mocks.query,
    $transaction: mocks.transaction,
  },
}));
import { ProposalTransitionConflictError, TraceQmsProposalStore } from "./trace-qms-proposal-store";

const identity = "11111111-1111-4111-8111-111111111111";
const proposalId = "22222222-2222-4222-8222-222222222222";
const context = (grants: PlatformAuthorizationContext["grants"]): PlatformAuthorizationContext => ({
  platformIdentityId: identity,
  platformMembershipId: "33333333-3333-4333-8333-333333333333",
  identityStatus: "ACTIVE",
  membershipStatus: "ACTIVE",
  grants,
});
const input = { proposalId, expectedRevision: 0, action: "SUBMIT" as const, reason: "Ready for review" };

describe("commercial proposal persistence guardrails", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ $queryRaw: mocks.query, $executeRaw: mocks.execute }));
  });
  it("rejects submission without sales manage before touching the database", async () => {
    await expect(new TraceQmsProposalStore().transition(context([]), input)).rejects.toThrow("Platform access denied");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects approval without subscription manage before touching the database", async () => {
    await expect(new TraceQmsProposalStore().transition(context(["platform.sales.manage"]), {
      ...input, action: "APPROVE",
    })).rejects.toThrow("Platform access denied");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects stale revision without writing an event", async () => {
    mocks.query.mockResolvedValue([]);
    await expect(new TraceQmsProposalStore().transition(context(["platform.sales.manage"]), input))
      .rejects.toBeInstanceOf(ProposalTransitionConflictError);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("writes an event after a successful revision update in one transaction", async () => {
    mocks.query.mockResolvedValue([{ id: proposalId, status: "SUBMITTED", revision: 1 }]);
    mocks.execute.mockResolvedValue(1);
    await expect(new TraceQmsProposalStore().transition(context(["platform.sales.manage"]), input))
      .resolves.toMatchObject({ status: "SUBMITTED", revision: 1 });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.invocationCallOrder[0]).toBeLessThan(mocks.execute.mock.invocationCallOrder[0]);
  });
  it("propagates event insert failure so the database transaction can roll back", async () => {
    mocks.query.mockResolvedValue([{ id: proposalId, status: "SUBMITTED", revision: 1 }]);
    mocks.execute.mockRejectedValue(new Error("event insert failed"));
    await expect(new TraceQmsProposalStore().transition(context(["platform.sales.manage"]), input))
      .rejects.toThrow("event insert failed");
  });
  it("validates revision and reason before starting a transaction", async () => {
    await expect(new TraceQmsProposalStore().transition(context(["platform.sales.manage"]), {
      ...input, expectedRevision: -1,
    })).rejects.toBeInstanceOf(RangeError);
    await expect(new TraceQmsProposalStore().transition(context(["platform.sales.manage"]), {
      ...input, reason: "  ",
    })).rejects.toBeInstanceOf(RangeError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
