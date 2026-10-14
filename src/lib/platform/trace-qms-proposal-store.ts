import { Prisma } from "@prisma/client";
import { db } from "../db";
import { requirePlatformAuthorization, type PlatformAuthorizationContext } from "./authorization";
import { calculateTraceQmsProposal, type TraceQmsProposalInput } from "./trace-qms-proposal";
import { TRACE_QMS_PRICE_VERSION } from "./trace-qms-pricing";

/** Platform-only, immutable-at-creation proposal snapshots. No subscription or entitlement writes. */
export class TraceQmsProposalStore {
  async create(context: PlatformAuthorizationContext, input: TraceQmsProposalInput) {
    requirePlatformAuthorization(context, { permission: "platform.sales.manage" });
    const calculation = calculateTraceQmsProposal(input);
    const rows = await db.$queryRaw<{ id: string; status: string; revision: number }[]>(Prisma.sql`
      INSERT INTO "TraceQmsCommercialProposal"
        ("id", "customerName", "priceVersion", "inputSnapshot", "calculationSnapshot", "createdByIdentityId", "updatedAt")
      VALUES
        (gen_random_uuid(), ${calculation.customerName}, ${TRACE_QMS_PRICE_VERSION},
         ${JSON.stringify(input)}::jsonb, ${JSON.stringify(calculation)}::jsonb,
         ${context.platformIdentityId}::uuid, CURRENT_TIMESTAMP)
      RETURNING "id", "status", "revision"
    `);
    return rows[0];
  }

  async list(context: PlatformAuthorizationContext) {
    requirePlatformAuthorization(context, { permission: "platform.sales.read" });
    return db.$queryRaw<Array<{
      id: string;
      customerName: string;
      priceVersion: string;
      status: string;
      revision: number;
      calculationSnapshot: unknown;
      createdAt: Date;
    }>>(Prisma.sql`
      SELECT "id", "customerName", "priceVersion", "status", "revision", "calculationSnapshot", "createdAt"
      FROM "TraceQmsCommercialProposal" ORDER BY "createdAt" DESC LIMIT 100
    `);
  }
  /** Atomic revision-checked transition. Commercial approval requires a separate authorized identity. */
  async transition(
    context: PlatformAuthorizationContext,
    input: { proposalId: string; expectedRevision: number; action: "SUBMIT" | "APPROVE" | "REJECT"; reason: string },
  ) {
    requirePlatformAuthorization(context, {
      permission: input.action === "SUBMIT" ? "platform.sales.manage" : "platform.subscription.manage",
    });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.proposalId)) {
      throw new RangeError("Invalid proposal ID.");
    }
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw new RangeError("Invalid expected revision.");
    }
    const reason = input.reason.trim();
    if (!reason || reason.length > 1000) throw new RangeError("Reason must contain 1–1000 characters.");
    const fromStatus = input.action === "SUBMIT" ? "DRAFT" : "SUBMITTED";
    const toStatus = input.action === "SUBMIT" ? "SUBMITTED" : input.action === "APPROVE" ? "APPROVED" : "REJECTED";
    return db.$transaction(async (tx) => {
      const updated = await tx.$queryRaw<Array<{ id: string; status: string; revision: number }>>(Prisma.sql`
        UPDATE "TraceQmsCommercialProposal"
        SET "status" = ${toStatus}, "revision" = "revision" + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${input.proposalId}::uuid
          AND "status" = ${fromStatus}
          AND "revision" = ${input.expectedRevision}
          AND (
            ${input.action} = 'SUBMIT'
            OR "createdByIdentityId" <> ${context.platformIdentityId}::uuid
          )
        RETURNING "id", "status", "revision"
      `);
      if (updated.length !== 1) throw new ProposalTransitionConflictError();
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "TraceQmsCommercialProposalEvent"
          ("id", "proposalId", "revision", "action", "fromStatus", "toStatus", "actorIdentityId", "reason")
        VALUES
          (gen_random_uuid(), ${input.proposalId}::uuid, ${updated[0].revision},
           ${input.action}, ${fromStatus}, ${toStatus}, ${context.platformIdentityId}::uuid, ${reason})
      `);
      return updated[0];
    });
  }

}

export class ProposalTransitionConflictError extends Error {
  constructor() { super("Proposal transition rejected: status, revision, or approval separation check failed."); }
}
