import { competencyScopeJoins, competencyScopeLabel } from "./competency-program-scope";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { CompetencyEligibilityError, CompetencyValidationError } from "./competency";
import type {
  CompetencyRequirement,
  CompetencyRequirementRow,
  CompetencyRequirementScope,
  CompetencyRequirementTarget,
  CompetencyRequirementsView,
} from "./competency-requirements";

const targets = {
  EMPLOYEE: {
    table: Prisma.sql`"Employee"`,
    column: Prisma.sql`"employeeId"`,
    active: Prisma.sql`"status" = 'ACTIVE'`,
    label: Prisma.sql`"employeeNumber" || ' · ' || "lastName" || ', ' || "firstName"`,
  },
  DEPARTMENT: {
    table: Prisma.sql`"Department"`,
    column: Prisma.sql`"departmentId"`,
    active: Prisma.sql`"active"`,
    label: Prisma.sql`"name" || COALESCE(' · ' || (SELECT s."name" FROM "Site" s
      WHERE s."organizationId" = "Department"."organizationId" AND s."id" = "Department"."siteId"), '')`,
  },
  JOB: {
    table: Prisma.sql`"JobDescription"`,
    column: Prisma.sql`"jobDescriptionId"`,
    active: Prisma.sql`"active"`,
    label: Prisma.sql`"code" || ' · ' || "title"`,
  },
} satisfies Record<CompetencyRequirementScope, Record<string, Prisma.Sql>>;

export async function listCompetencyRequirements(
  organizationId: string,
  includeTargets: boolean,
  includeEquipment = false,
): Promise<CompetencyRequirementsView> {
  return db.$transaction(async (tx) => {
    const requirements = await tx.$queryRaw<CompetencyRequirement[]>`
      SELECT r."id", r."programId", concat_ws(' · ', p."code", p."title", ${competencyScopeLabel}) AS "programLabel",
        CASE WHEN r."employeeId" IS NOT NULL THEN 'EMPLOYEE'
          WHEN r."departmentId" IS NOT NULL THEN 'DEPARTMENT' ELSE 'JOB' END AS "scope",
        COALESCE(r."employeeId", r."departmentId", r."jobDescriptionId") AS "targetId",
        COALESCE(e."employeeNumber" || ' · ' || e."lastName" || ', ' || e."firstName",
          d."name" || COALESCE(' · ' || s."name", ''), j."code" || ' · ' || j."title") AS "targetLabel"
      FROM "CompetencyRequirement" r
      JOIN "CompetencyProgram" p ON (p."organizationId", p."id") = (r."organizationId", r."programId")
      ${competencyScopeJoins(includeEquipment)}
      LEFT JOIN "Employee" e ON (e."organizationId", e."id") = (r."organizationId", r."employeeId")
      LEFT JOIN "Department" d ON (d."organizationId", d."id") = (r."organizationId", r."departmentId")
      LEFT JOIN "Site" s ON (s."organizationId", s."id") = (d."organizationId", d."siteId")
      LEFT JOIN "JobDescription" j ON (j."organizationId", j."id") = (r."organizationId", r."jobDescriptionId")
      WHERE r."organizationId" = ${organizationId}::uuid AND r."retiredAt" IS NULL
      ORDER BY p."code", "scope", "targetLabel", r."id"
    `;

    const rows = await tx.$queryRaw<CompetencyRequirementRow[]>`
      WITH rules AS (
        SELECT r.* FROM "CompetencyRequirement" r
        WHERE r."organizationId" = ${organizationId}::uuid AND r."retiredAt" IS NULL
      ), current_jobs AS (
        SELECT j.* FROM "EmployeeJobAssignment" j
        WHERE j."organizationId" = ${organizationId}::uuid
          AND j."assignedAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
          AND (j."endedAt" IS NULL OR j."endedAt" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)
      ), matches AS (
        SELECT r."id", r."programId", r."employeeId",
          (r."createdAt" AT TIME ZONE 'UTC')::date AS "effectiveOn"
        FROM rules r WHERE r."employeeId" IS NOT NULL
        UNION ALL
        SELECT r."id", r."programId", j."employeeId",
          GREATEST((r."createdAt" AT TIME ZONE 'UTC')::date, j."assignedAt")
        FROM rules r
        JOIN current_jobs j ON j."departmentId" = r."departmentId"
        UNION ALL
        SELECT r."id", r."programId", j."employeeId",
          GREATEST((r."createdAt" AT TIME ZONE 'UTC')::date, j."assignedAt")
        FROM rules r
        JOIN current_jobs j ON j."jobDescriptionId" = r."jobDescriptionId"
      ), required_pairs AS (
        SELECT "programId", "employeeId", array_agg(DISTINCT "id" ORDER BY "id") AS "requirementIds",
          MIN("effectiveOn")::text AS "requirementEffectiveOn"
        FROM matches GROUP BY "programId", "employeeId"
      )
      SELECT pair.*, e."employeeNumber" || ' · ' || e."lastName" || ', ' || e."firstName" AS "employeeLabel",
        concat_ws(' · ', p."code", p."title", ${competencyScopeLabel}) AS "programLabel", to_jsonb(a) AS "assessment",
        p."initialDueDays", p."reassessmentIntervalDays",
        (q."assessedAt" AT TIME ZONE 'UTC')::date::text AS "lastQualifiedAt",
        q."expiresAt"::text AS "lastQualifiedExpiresAt"
      FROM required_pairs pair
      JOIN "Employee" e ON e."organizationId" = ${organizationId}::uuid AND e."id" = pair."employeeId" AND e."status" = 'ACTIVE'
      JOIN "CompetencyProgram" p ON p."organizationId" = ${organizationId}::uuid AND p."id" = pair."programId" AND p."active"
      ${competencyScopeJoins(includeEquipment)}
      LEFT JOIN LATERAL (
        SELECT "id", "employeeId", "programId", "assessedAt", "outcome", "expiresAt"
        FROM "CompetencyAssessment"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "employeeId" = pair."employeeId" AND "programId" = pair."programId"
        ORDER BY "assessedAt" DESC, "createdAt" DESC, "id" DESC LIMIT 1
      ) a ON true
      LEFT JOIN LATERAL (
        SELECT "assessedAt", "expiresAt" FROM "CompetencyAssessment"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "employeeId" = pair."employeeId" AND "programId" = pair."programId"
          AND "outcome" = 'QUALIFIED'
        ORDER BY "assessedAt" DESC, "createdAt" DESC, "id" DESC LIMIT 1
      ) q ON true
      ORDER BY e."employeeNumber", p."code"
    `;

    const availableTargets: CompetencyRequirementsView["targets"] = { EMPLOYEE: [], DEPARTMENT: [], JOB: [] };
    if (includeTargets) {
      for (const scope of Object.keys(targets) as CompetencyRequirementScope[]) {
        const target = targets[scope];
        availableTargets[scope] = await tx.$queryRaw<CompetencyRequirementTarget[]>`
          SELECT "id", ${target.label} AS "label" FROM ${target.table}
          WHERE "organizationId" = ${organizationId}::uuid AND ${target.active} ORDER BY "label", "id"
        `;
      }
    }
    return { requirements, rows, targets: availableTargets };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

type WriteContext = { organizationId: string; actorUserId: string };

export async function createCompetencyRequirement(input: WriteContext & {
  programId: string;
  scope: CompetencyRequirementScope;
  targetId: string;
}) {
  const { organizationId, actorUserId, programId, scope, targetId } = input;
  const target = targets[scope];
  return db.$transaction(async (tx) => {
    // Lock eligibility rows through the insert so a concurrent status change cannot pass stale checks.
    const [program] = await tx.$queryRaw<{ active: boolean }[]>`
      SELECT "active" FROM "CompetencyProgram"
      WHERE "organizationId" = ${organizationId}::uuid AND "id" = ${programId}::uuid FOR SHARE
    `;
    const [subject] = await tx.$queryRaw<{ active: boolean }[]>`
      SELECT (${target.active}) AS "active" FROM ${target.table}
      WHERE "organizationId" = ${organizationId}::uuid AND "id" = ${targetId}::uuid FOR SHARE
    `;
    if (!program || !subject) throw new Error("Access denied");
    if (!program.active || !subject.active) {
      throw new CompetencyEligibilityError("Select an active program and an active requirement target.");
    }

    const [requirement] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "CompetencyRequirement" ("organizationId", "programId", ${target.column})
      VALUES (${organizationId}::uuid, ${programId}::uuid, ${targetId}::uuid)
      ON CONFLICT DO NOTHING RETURNING "id"
    `;
    if (!requirement) throw new CompetencyValidationError("This requirement already exists.");
    await tx.auditEvent.create({ data: {
      organizationId, actorUserId, action: "COMPETENCY_REQUIREMENT_CREATED",
      entityType: "CompetencyRequirement", entityId: requirement.id,
      metadata: { programId, scope, targetId },
    } });
    return requirement;
  });
}

export async function retireCompetencyRequirement(input: WriteContext & { requirementId: string; reason: string }) {
  const { organizationId, actorUserId, requirementId, reason } = input;
  return db.$transaction(async (tx) => {
    const [retired] = await tx.$queryRaw<{ id: string; programId: string }[]>`
      UPDATE "CompetencyRequirement" SET "retiredAt" = CURRENT_TIMESTAMP
      WHERE "organizationId" = ${organizationId}::uuid AND "id" = ${requirementId}::uuid
        AND "retiredAt" IS NULL
      RETURNING "id", "programId"
    `;
    if (!retired) throw new CompetencyEligibilityError("Active competency requirement not found.");
    await tx.auditEvent.create({ data: {
      organizationId, actorUserId, action: "COMPETENCY_REQUIREMENT_RETIRED",
      entityType: "CompetencyRequirement", entityId: requirementId,
      metadata: { programId: retired.programId, reason },
    } });
    return { id: retired.id };
  });
}
