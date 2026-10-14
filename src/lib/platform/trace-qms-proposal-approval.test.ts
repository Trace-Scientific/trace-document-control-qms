import { describe, expect, it } from "vitest";
import { transitionProposal, type TraceQmsProposalRecord } from "./trace-qms-proposal-approval";

const draft = (): TraceQmsProposalRecord => ({
  id: "proposal-1",
  input: { customerName: "Example Lab", package: "essential", users: 10 },
  status: "DRAFT",
  revision: 0,
  events: [],
});
const timestamp = "2026-10-14T12:00:00.000Z";

describe("proposal approval state machine", () => {
  it("records submission and approval without changing quote inputs", () => {
    const submitted = transitionProposal(draft(), "SUBMIT", "sales-user", "Ready for review", timestamp);
    const approved = transitionProposal(submitted, "APPROVE", "manager-user", "Pricing approved", timestamp);
    expect(approved.status).toBe("APPROVED");
    expect(approved.revision).toBe(2);
    expect(approved.events).toHaveLength(2);
    expect(approved.input).toEqual(draft().input);
  });
  it("rejects approval of a draft and modifications after approval", () => {
    expect(() => transitionProposal(draft(), "APPROVE", "manager", "Approved", timestamp)).toThrow();
    const submitted = transitionProposal(draft(), "SUBMIT", "sales", "Review", timestamp);
    const approved = transitionProposal(submitted, "APPROVE", "manager", "Approved", timestamp);
    expect(() => transitionProposal(approved, "REJECT", "manager", "Change", timestamp)).toThrow();
  });
  it("requires attributable, reasoned events", () => {
    expect(() => transitionProposal(draft(), "SUBMIT", "", "Review", timestamp)).toThrow();
    expect(() => transitionProposal(draft(), "SUBMIT", "sales", "", timestamp)).toThrow();
    expect(() => transitionProposal(draft(), "SUBMIT", "sales", "Review", "not-a-date")).toThrow();
  });
  it("rejects duplicate submission, invalid rejection and terminal-state changes", () => {
    const submitted = transitionProposal(draft(), "SUBMIT", "sales", "Review", timestamp);
    expect(() => transitionProposal(submitted, "SUBMIT", "sales", "Again", timestamp)).toThrow();
    expect(() => transitionProposal(draft(), "REJECT", "manager", "Not reviewed", timestamp)).toThrow();
    const rejected = transitionProposal(submitted, "REJECT", "manager", "Not approved", timestamp);
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.revision).toBe(2);
    expect(rejected.events[1]).toMatchObject({ action: "REJECT", from: "SUBMITTED", to: "REJECTED" });
    expect(() => transitionProposal(rejected, "APPROVE", "manager", "Override", timestamp)).toThrow();
    expect(() => transitionProposal(rejected, "SUBMIT", "sales", "Retry", timestamp)).toThrow();
  });
  it("preserves the original draft and records an attributable event", () => {
    const original = draft();
    const submitted = transitionProposal(original, "SUBMIT", "sales", "Review", timestamp);
    expect(original.status).toBe("DRAFT");
    expect(original.revision).toBe(0);
    expect(original.events).toHaveLength(0);
    expect(submitted.events).toEqual([{
      action: "SUBMIT", actorId: "sales", reason: "Review", at: timestamp,
      from: "DRAFT", to: "SUBMITTED",
    }]);
  });
});
