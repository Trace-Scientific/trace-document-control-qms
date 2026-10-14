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
}
