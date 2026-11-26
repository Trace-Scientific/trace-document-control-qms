import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { CompetencyEligibilityError, CompetencyValidationError } from "./competency";

type ReadScope = { organizationId: string; assessmentId: string };
type WriteScope = ReadScope & { actorUserId: string };
type RemediationSource = {
  programId: string;
  employeeId: string;
  assessedAt: Date;
  outcome: "QUALIFIED" | "CONDITIONAL" | "NOT_QUALIFIED";
};

type RemediationCase = {
  id: string;
  plan: string;
  dueOn: string | null;
  closedAt: Date | null;
  followUpAssessmentId: string | null;
  followUpAssessedAt: Date | null;
  resolution: string | null;
};
type FollowUp = { id: string; assessedAt: Date };
export type CompetencyRemediationView = {
  remediation: RemediationCase | null;
  eligibleFollowUp: FollowUp | null;
};

async function loadSource(tx: Prisma.TransactionClient, { organizationId, assessmentId }: ReadScope) {
  const [source] = await tx.$queryRaw<RemediationSource[]>`
    SELECT "programId", "employeeId", "assessedAt", "outcome" FROM "CompetencyAssessment"
    WHERE "organizationId" = ${organizationId}::uuid AND "id" = ${assessmentId}::uuid
  `;
  return source;
}

async function findFollowUp(tx: Prisma.TransactionClient, organizationId: string, source: RemediationSource) {
  const [followUp] = await tx.$queryRaw<Array<FollowUp & { outcome: RemediationSource["outcome"] }>>`
    SELECT "id", "assessedAt", "outcome" FROM "CompetencyAssessment"
    WHERE "organizationId" = ${organizationId}::uuid AND "employeeId" = ${source.employeeId}::uuid
      AND "programId" = ${source.programId}::uuid AND "assessedAt" > ${source.assessedAt}
    ORDER BY "assessedAt" DESC, "createdAt" DESC, "id" DESC LIMIT 1
  `;
  return followUp?.outcome === "QUALIFIED" ? { id: followUp.id, assessedAt: followUp.assessedAt } : null;
}

export async function readCompetencyRemediation(scope: ReadScope, includeFollowUp: boolean): Promise<CompetencyRemediationView | null> {
  return db.$transaction(async (tx) => {
    const source = await loadSource(tx, scope);
    if (!source || source.outcome === "QUALIFIED") return null;
    const { organizationId, assessmentId } = scope;
    const [remediation] = await tx.$queryRaw<RemediationCase[]>`
      SELECT r."id", r."plan", r."dueOn"::text AS "dueOn", r."closedAt", r."followUpAssessmentId",
        a."assessedAt" AS "followUpAssessedAt", r."resolution"
      FROM "CompetencyRemediation" r
      LEFT JOIN "CompetencyAssessment" a ON (a."organizationId", a."id") = (r."organizationId", r."followUpAssessmentId")
      WHERE r."organizationId" = ${organizationId}::uuid AND r."assessmentId" = ${assessmentId}::uuid
    `;
    const eligibleFollowUp = includeFollowUp && remediation && !remediation.closedAt
      ? await findFollowUp(tx, organizationId, source)
      : null;
    return { remediation: remediation ?? null, eligibleFollowUp };
  });
}

export async function openCompetencyRemediation(input: WriteScope & { plan: string; dueOn: string | null }) {
  return db.$transaction(async (tx) => {
    const source = await loadSource(tx, input);
    if (!source) throw new Error("Access denied");
    if (source.outcome === "QUALIFIED") throw new CompetencyEligibilityError("Select a failed or conditional assessment.");
    const { organizationId, assessmentId, actorUserId, plan, dueOn } = input;
    const [remediation] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "CompetencyRemediation" ("organizationId", "assessmentId", "plan", "dueOn")
      VALUES (${organizationId}::uuid, ${assessmentId}::uuid, ${plan}, ${dueOn}::date)
      ON CONFLICT ("organizationId", "assessmentId") DO NOTHING RETURNING "id"
    `;
    if (!remediation) throw new CompetencyValidationError("A remediation plan already exists for this assessment.");
    await tx.auditEvent.create({ data: {
      organizationId, actorUserId, action: "COMPETENCY_REMEDIATION_OPENED",
      entityType: "CompetencyRemediation", entityId: remediation.id,
      metadata: { assessmentId, employeeId: source.employeeId, programId: source.programId, dueOn },
    } });
    return remediation;
  });
}

export async function closeCompetencyRemediation(input: WriteScope & { followUpAssessmentId: string; resolution: string }) {
  return db.$transaction(async (tx) => {
    const source = await loadSource(tx, input);
    if (!source) throw new Error("Access denied");
    const { organizationId, assessmentId, actorUserId, followUpAssessmentId, resolution } = input;
    // Assessment creation locks this same row before writing a new outcome.
    await tx.$queryRaw`
      SELECT "id" FROM "CompetencyProgram"
      WHERE "organizationId" = ${organizationId}::uuid AND "id" = ${source.programId}::uuid
      FOR UPDATE
    `;
    const followUp = await findFollowUp(tx, organizationId, source);
    if (followUp?.id !== followUpAssessmentId) {
      throw new CompetencyEligibilityError("The latest follow-up assessment must be qualified. Refresh this record before closing.");
    }

    const [remediation] = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "CompetencyRemediation"
      SET "closedAt" = CURRENT_TIMESTAMP, "followUpAssessmentId" = ${followUpAssessmentId}::uuid, "resolution" = ${resolution}
      WHERE "organizationId" = ${organizationId}::uuid AND "assessmentId" = ${assessmentId}::uuid AND "closedAt" IS NULL
      RETURNING "id"
    `;
    if (!remediation) throw new CompetencyEligibilityError("No open remediation plan was found.");
    await tx.auditEvent.create({ data: {
      organizationId, actorUserId, action: "COMPETENCY_REMEDIATION_CLOSED",
      entityType: "CompetencyRemediation", entityId: remediation.id,
      metadata: { assessmentId, followUpAssessmentId, employeeId: source.employeeId, programId: source.programId },
    } });
    return remediation;
  });
}

export type RemediationCoverage = {
  employeeId: string;
  open: number;
  pastDue: number;
  closed: number;
};

export function listRemediationCoverage(organizationId: string, asOf: string) {
  return db.$queryRaw<RemediationCoverage[]>`
    SELECT a."employeeId",
      COUNT(*) FILTER (WHERE r."closedAt" IS NULL)::int AS "open",
      COUNT(*) FILTER (WHERE r."closedAt" IS NULL AND r."dueOn" < ${asOf}::date)::int AS "pastDue",
      COUNT(*) FILTER (WHERE r."closedAt" IS NOT NULL)::int AS "closed"
    FROM "CompetencyRemediation" r
    JOIN "CompetencyAssessment" a
      ON (a."organizationId", a."id") = (r."organizationId", r."assessmentId")
    JOIN "Employee" e
      ON (e."organizationId", e."id") = (a."organizationId", a."employeeId") AND e."status" = 'ACTIVE'
    WHERE r."organizationId" = ${organizationId}::uuid
    GROUP BY a."employeeId"
  `;
}
