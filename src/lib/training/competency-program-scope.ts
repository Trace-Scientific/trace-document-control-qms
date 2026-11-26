import { Prisma } from "@prisma/client";
import { db } from "../db";

export type CompetencyProgramScopeInput = {
  equipmentId?: string | null;
  testSystemId?: string | null;
  newTestSystem?: { code: string; name: string } | null;
};

export type CompetencyProgramScopeOption = { id: string; label: string };
export type CompetencyProgramScopeOptions = {
  equipment: CompetencyProgramScopeOption[];
  testSystems: CompetencyProgramScopeOption[];
  canReadEquipment: boolean;
};

// The caller's p alias is always an organization-scoped CompetencyProgram.
export function competencyScopeJoins(includeEquipment: boolean) {
  return Prisma.sql`
    LEFT JOIN "CompetencyTestSystem" ts
      ON (ts."organizationId", ts."id") = (p."organizationId", p."testSystemId")
    LEFT JOIN "Equipment" eq
      ON ${includeEquipment} AND (eq."organizationId", eq."id") = (p."organizationId", p."equipmentId")
  `;
}

export const competencyScopeLabel = Prisma.sql`
  NULLIF(concat_ws(' / ',
    CASE WHEN ts."id" IS NOT NULL THEN 'Test system: ' || ts."code" || ' · ' || ts."name" END,
    CASE WHEN eq."id" IS NOT NULL THEN 'Instrument: ' || eq."equipmentNumber" || ' · ' || eq."name" END
  ), '')
`;

export async function listCompetencyProgramScopeOptions(
  organizationId: string,
  canReadEquipment: boolean,
): Promise<CompetencyProgramScopeOptions> {
  const [equipment, testSystems] = await Promise.all([
    canReadEquipment ? db.$queryRaw<CompetencyProgramScopeOption[]>`
      SELECT "id", "equipmentNumber" || ' · ' || "name" AS "label"
      FROM "Equipment" WHERE "organizationId" = ${organizationId}::uuid AND "status" = 'ACTIVE'
      ORDER BY "equipmentNumber"
    ` : [],
    db.$queryRaw<CompetencyProgramScopeOption[]>`
      SELECT "id", "code" || ' · ' || "name" AS "label"
      FROM "CompetencyTestSystem" WHERE "organizationId" = ${organizationId}::uuid
      ORDER BY "code"
    `,
  ]);
  return { equipment, testSystems, canReadEquipment };
}
