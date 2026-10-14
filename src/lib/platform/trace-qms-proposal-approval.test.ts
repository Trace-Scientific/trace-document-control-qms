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
});
