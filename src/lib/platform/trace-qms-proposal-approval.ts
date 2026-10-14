import { calculateTraceQmsProposal, type TraceQmsProposalInput } from "./trace-qms-proposal";

export type ProposalStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
export type ProposalAction = "SUBMIT" | "APPROVE" | "REJECT";

export interface ProposalApprovalEvent {
  action: ProposalAction;
  actorId: string;
  reason: string;
  at: string;
  from: ProposalStatus;
  to: ProposalStatus;
}

export interface TraceQmsProposalRecord {
  id: string;
  input: TraceQmsProposalInput;
  status: ProposalStatus;
  revision: number;
  events: readonly ProposalApprovalEvent[];
}

/** Pure approval state machine. Persistence, authenticated identity, and audit storage must be added before production use. */
export function transitionProposal(
  record: TraceQmsProposalRecord,
  action: ProposalAction,
  actorId: string,
  reason: string,
  at: string,
): TraceQmsProposalRecord {
  if (!actorId.trim() || !reason.trim() || !Number.isFinite(Date.parse(at))) {
    throw new RangeError("Approval transitions require actor, reason, and valid timestamp.");
  }
  calculateTraceQmsProposal(record.input);
  const allowed: Record<ProposalStatus, Partial<Record<ProposalAction, ProposalStatus>>> = {
    DRAFT: { SUBMIT: "SUBMITTED" },
    SUBMITTED: { APPROVE: "APPROVED", REJECT: "REJECTED" },
    APPROVED: {},
    REJECTED: {},
  };
  const next = allowed[record.status][action];
  if (!next) throw new RangeError("Invalid proposal status transition.");
  return {
    ...record,
    status: next,
    revision: record.revision + 1,
    events: [...record.events, { action, actorId: actorId.trim(), reason: reason.trim(), at, from: record.status, to: next }],
  };
}
