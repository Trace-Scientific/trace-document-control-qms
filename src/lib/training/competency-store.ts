import type { CompetencyScheduleSettings } from "./competency-schedule";
import { competencyScopeJoins, competencyScopeLabel, type CompetencyProgramScopeInput } from "./competency-program-scope";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import type { CompetencyAssessmentRecord, CompetencyElementInput, CompetencyElementRecord, CompetencyProgramRecord, CompetencyProgramWrite, CompetencyStore } from "./competency";
import { CompetencyEligibilityError, CompetencyValidationError } from "./competency";

// A fresh statement snapshot after the lock sees the previous writer's committed rows.
const programWriteTransaction = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted };

async function lockProgram(tx: Prisma.TransactionClient, input: CompetencyProgramWrite) {
  const [program] = await tx.$queryRaw<Array<Pick<CompetencyProgramRecord, "active" | "validityDays"> & { requiresAuthorizedEvaluator: boolean }>>`
    SELECT "active", "validityDays", "requiresAuthorizedEvaluator" FROM "CompetencyProgram"
    WHERE "organizationId" = ${input.organizationId}::uuid AND "id" = ${input.programId}::uuid
    FOR UPDATE
  `;
  if (!program) throw new Error("Access denied");
  return program;
}

async function insertElement(tx: Prisma.TransactionClient, scope: CompetencyProgramWrite, input: CompetencyElementInput) {
  const [element] = await tx.$queryRaw<CompetencyElementRecord[]>`
    INSERT INTO "CompetencyElement" ("organizationId", "programId", "code", "title", "method", "required", "sortOrder")
    VALUES (${scope.organizationId}::uuid, ${scope.programId}::uuid, ${input.code}, ${input.title},
      ${input.method}, ${input.required}, ${input.sortOrder})
    ON CONFLICT ("organizationId", "programId", "code") DO NOTHING
    RETURNING *
  `;
  if (!element) throw new CompetencyValidationError(`Element code ${input.code} already exists in this program.`);
  await tx.auditEvent.create({
    data: {
      organizationId: scope.organizationId,
      actorUserId: scope.actorUserId,
      action: "COMPETENCY_ELEMENT_CREATED",
      entityType: "CompetencyElement",
      entityId: element.id,
      metadata: { programId: element.programId, code: element.code },
    },
  });
  return element;
}

export class PrismaCompetencyStore implements CompetencyStore {
  listPrograms(organizationId: string, includeEquipment = false) {
    return db.$queryRaw<CompetencyProgramRecord[]>`
      SELECT p."id", p."organizationId", p."code", p."title", p."description",
        p."active", p."validityDays", p."initialDueDays", p."firstReassessmentDays", p."reassessmentIntervalDays", p."createdAt", p."updatedAt", ${competencyScopeLabel} AS "scopeLabel"
      FROM "CompetencyProgram" p ${competencyScopeJoins(includeEquipment)}
      WHERE p."organizationId" = ${organizationId}::uuid ORDER BY p."code"
    `;
  }

  async createProgram(input: {
    organizationId: string; code: string; title: string; description: string | null;
    validityDays: number | null; actorUserId: string;
  } & CompetencyProgramScopeInput & CompetencyScheduleSettings) {
    const { organizationId, actorUserId, code, title, description, validityDays, equipmentId = null } = input;
    const { initialDueDays = null, firstReassessmentDays = null, reassessmentIntervalDays = null } = input;
    return db.$transaction(async (tx) => {
      if (equipmentId) {
        const [equipment] = await tx.$queryRaw<{ status: string }[]>`
          SELECT "status"::text AS "status" FROM "Equipment"
          WHERE "organizationId" = ${organizationId}::uuid AND "id" = ${equipmentId}::uuid FOR SHARE
        `;
        if (!equipment) throw new Error("Access denied");
        if (equipment.status !== "ACTIVE") throw new CompetencyEligibilityError("Select an active instrument.");
      }

      let testSystemId = input.testSystemId ?? null;
      if (testSystemId) {
        const [system] = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "CompetencyTestSystem"
          WHERE "organizationId" = ${organizationId}::uuid AND "id" = ${testSystemId}::uuid
        `;
        if (!system) throw new Error("Access denied");
      }
      if (input.newTestSystem) {
        const { code: systemCode, name } = input.newTestSystem;
        const [system] = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO "CompetencyTestSystem" ("organizationId", "code", "name")
          VALUES (${organizationId}::uuid, ${systemCode}, ${name})
          ON CONFLICT ("organizationId", "code") DO NOTHING RETURNING "id"
        `;
        if (!system) throw new CompetencyValidationError("This test system code already exists. Select the existing test system.");
        testSystemId = system.id;
        await tx.auditEvent.create({ data: {
          organizationId, actorUserId, action: "COMPETENCY_TEST_SYSTEM_CREATED",
          entityType: "CompetencyTestSystem", entityId: system.id, metadata: { code: systemCode, name },
        } });
      }

      const [program] = await tx.$queryRaw<CompetencyProgramRecord[]>`
        INSERT INTO "CompetencyProgram"
          ("organizationId", "code", "title", "description", "validityDays", "equipmentId", "testSystemId",
           "initialDueDays", "firstReassessmentDays", "reassessmentIntervalDays")
        VALUES (${organizationId}::uuid, ${code}, ${title}, ${description}, ${validityDays}, ${equipmentId}::uuid, ${testSystemId}::uuid,
          ${initialDueDays}, ${firstReassessmentDays}, ${reassessmentIntervalDays})
        ON CONFLICT ("organizationId", "code") DO NOTHING
        RETURNING "id", "organizationId", "code", "title", "description", "active", "validityDays",
          "initialDueDays", "firstReassessmentDays", "reassessmentIntervalDays", "createdAt", "updatedAt"
      `;
      if (!program) throw new CompetencyValidationError("This competency program code already exists.");
      await tx.auditEvent.create({ data: {
        organizationId, actorUserId, action: "COMPETENCY_PROGRAM_CREATED", entityType: "CompetencyProgram",
        entityId: program.id, metadata: { code, title, equipmentId, testSystemId, initialDueDays, firstReassessmentDays, reassessmentIntervalDays },
      } });
      return program;
    });
  }
  listElements(organizationId:string,programId:string){ return db.$queryRaw<CompetencyElementRecord[]>(Prisma.sql`SELECT * FROM "CompetencyElement" WHERE "organizationId"=${organizationId}::uuid AND "programId"=${programId}::uuid ORDER BY "sortOrder","code"`); }
  async createElement(input: CompetencyProgramWrite & CompetencyElementInput) {
    return db.$transaction(async (tx) => {
      const program = await lockProgram(tx, input);
      if (!program.active) throw new CompetencyEligibilityError("Inactive competency program cannot be changed");
      return insertElement(tx, input, input);
    }, programWriteTransaction);
  }

  async createCliaTemplate(input: CompetencyProgramWrite & { elements: CompetencyElementInput[] }) {
    return db.$transaction(async (tx) => {
      const program = await lockProgram(tx, input);
      if (!program.active) throw new CompetencyEligibilityError("Inactive competency program cannot be changed");

      const [assessment] = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "CompetencyAssessment"
        WHERE "organizationId" = ${input.organizationId}::uuid AND "programId" = ${input.programId}::uuid
        LIMIT 1
      `;
      if (assessment) {
        throw new CompetencyEligibilityError("This program already has assessments. Select a program without assessments.");
      }

      const created: CompetencyElementRecord[] = [];
      for (const element of input.elements) {
        created.push(await insertElement(tx, input, element));
      }
      return created;
    }, programWriteTransaction);
  }

  async listEvaluatorAuthorizations(organizationId: string, programId: string) {
    const [program] = await db.$queryRaw<{ requiresAuthorizedEvaluator: boolean }[]>`
      SELECT "requiresAuthorizedEvaluator" FROM "CompetencyProgram"
      WHERE "organizationId" = ${organizationId}::uuid AND "id" = ${programId}::uuid
    `;
    if (!program) throw new Error("Access denied");
    const [authorizations, candidates] = await Promise.all([
      db.$queryRaw<{ id: string; label: string; basis: string; eligible: boolean }[]>`
        SELECT a."id", e."employeeNumber" || ' · ' || e."lastName" || ', ' || e."firstName" AS "label", a."basis",
          (e."status" = 'ACTIVE' AND e."userId" IS NOT DISTINCT FROM a."userId" AND u."status" = 'ACTIVE') AS "eligible"
        FROM "CompetencyEvaluatorAuthorization" a
        JOIN "Employee" e ON (e."organizationId", e."id") = (a."organizationId", a."employeeId")
        JOIN "User" u ON (u."organizationId", u."id") = (a."organizationId", a."userId")
        WHERE a."organizationId" = ${organizationId}::uuid AND a."programId" = ${programId}::uuid AND a."revokedAt" IS NULL
        ORDER BY e."employeeNumber"
      `,
      db.$queryRaw<{ id: string; label: string }[]>`
        SELECT e."id", e."employeeNumber" || ' · ' || e."lastName" || ', ' || e."firstName" AS "label"
        FROM "Employee" e
        JOIN "User" u ON (u."organizationId", u."id") = (e."organizationId", e."userId")
        WHERE e."organizationId" = ${organizationId}::uuid AND e."status" = 'ACTIVE' AND u."status" = 'ACTIVE'
        ORDER BY e."employeeNumber"
      `,
    ]);
    return { ...program, authorizations, candidates };
  }

  async authorizeEvaluator(input: CompetencyProgramWrite & { employeeId: string; fileId: string; basis: string }) {
    return db.$transaction(async (tx) => {
      const program = await lockProgram(tx, input);
      if (!program.active) throw new CompetencyEligibilityError("Select an active competency program.");
      const { organizationId, programId, employeeId, fileId, basis, actorUserId } = input;
      const [employee] = await tx.$queryRaw<{ userId: string }[]>`
        SELECT e."userId" FROM "Employee" e
        JOIN "User" u ON (u."organizationId", u."id") = (e."organizationId", e."userId")
        WHERE e."organizationId" = ${organizationId}::uuid AND e."id" = ${employeeId}::uuid
          AND e."status" = 'ACTIVE' AND u."status" = 'ACTIVE' FOR SHARE OF e, u
      `;
      if (!employee) throw new CompetencyEligibilityError("Choose an active employee with an active linked account.");
      const file = await tx.fileObject.findFirst({ where: { organizationId, id: fileId }, select: { status: true } });
      if (!file) throw new Error("Access denied");
      if (file.status !== "AVAILABLE") throw new CompetencyEligibilityError("Choose written authorization evidence with status Available.");
      const [authorization] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "CompetencyEvaluatorAuthorization" ("organizationId", "programId", "employeeId", "userId", "fileId", "basis")
        VALUES (${organizationId}::uuid, ${programId}::uuid, ${employeeId}::uuid, ${employee.userId}::uuid, ${fileId}::uuid, ${basis})
        ON CONFLICT DO NOTHING RETURNING "id"
      `;
      if (!authorization) throw new CompetencyValidationError("This evaluator is already authorized for the program.");
      if (!program.requiresAuthorizedEvaluator) {
        await tx.$executeRaw`
          UPDATE "CompetencyProgram" SET "requiresAuthorizedEvaluator" = true, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "organizationId" = ${organizationId}::uuid AND "id" = ${programId}::uuid
        `;
      }
      await tx.auditEvent.create({ data: {
        organizationId, actorUserId, action: "COMPETENCY_EVALUATOR_AUTHORIZED",
        entityType: "CompetencyEvaluatorAuthorization", entityId: authorization.id,
        metadata: { programId, employeeId, evaluatorUserId: employee.userId, fileId, basis, restrictionEnabled: !program.requiresAuthorizedEvaluator },
      } });
      return authorization;
    }, programWriteTransaction);
  }

  async revokeEvaluator(input: CompetencyProgramWrite & { authorizationId: string; reason: string }) {
    return db.$transaction(async (tx) => {
      await lockProgram(tx, input);
      const { organizationId, programId, authorizationId, reason, actorUserId } = input;
      const [authorization] = await tx.$queryRaw<{ id: string; userId: string }[]>`
        UPDATE "CompetencyEvaluatorAuthorization" SET "revokedAt" = CURRENT_TIMESTAMP
        WHERE "organizationId" = ${organizationId}::uuid AND "programId" = ${programId}::uuid
          AND "id" = ${authorizationId}::uuid AND "revokedAt" IS NULL
        RETURNING "id", "userId"
      `;
      if (!authorization) throw new CompetencyEligibilityError("Active evaluator authorization not found.");
      await tx.auditEvent.create({ data: {
        organizationId, actorUserId, action: "COMPETENCY_EVALUATOR_REVOKED",
        entityType: "CompetencyEvaluatorAuthorization", entityId: authorization.id,
        metadata: { programId, evaluatorUserId: authorization.userId, reason },
      } });
      return { id: authorization.id };
    }, programWriteTransaction);
  }

  listAssessments(organizationId:string,employeeId?:string){ return db.$queryRaw<CompetencyAssessmentRecord[]>(employeeId?Prisma.sql`SELECT * FROM "CompetencyAssessment" WHERE "organizationId"=${organizationId}::uuid AND "employeeId"=${employeeId}::uuid ORDER BY "assessedAt" DESC`:Prisma.sql`SELECT * FROM "CompetencyAssessment" WHERE "organizationId"=${organizationId}::uuid ORDER BY "assessedAt" DESC`); }
  async createAssessment(input:{organizationId:string;employeeId:string;programId:string;assessedAt:Date;outcome:CompetencyAssessmentRecord["outcome"];expiresAt:Date|null;fileId:string|null;notes:string|null;elementResults:Array<{elementId:string;outcome:"PASS"|"FAIL"|"NOT_APPLICABLE";notes?:string|null}>;actorUserId:string}){
    return db.$transaction(async tx=>{
      const employees=await tx.$queryRaw<Array<{status:string}>>(Prisma.sql`SELECT "status"::text AS "status" FROM "Employee" WHERE "organizationId"=${input.organizationId}::uuid AND "id"=${input.employeeId}::uuid`); if(!employees[0]) throw new Error("Access denied"); if(employees[0].status==="TERMINATED") throw new CompetencyEligibilityError("Competency cannot be assessed for a terminated employee");
      const program = await lockProgram(tx, input);
      if (!program.active) throw new CompetencyEligibilityError("Inactive competency program cannot be assessed");
      let evaluatorAuthorizationId: string | null = null;
      if (program.requiresAuthorizedEvaluator) {
        const [authorization] = await tx.$queryRaw<{ id: string }[]>`
          SELECT a."id" FROM "CompetencyEvaluatorAuthorization" a
          JOIN "Employee" e ON (e."organizationId", e."id", e."userId") = (a."organizationId", a."employeeId", a."userId")
          JOIN "User" u ON (u."organizationId", u."id") = (a."organizationId", a."userId")
          WHERE a."organizationId" = ${input.organizationId}::uuid AND a."programId" = ${input.programId}::uuid
            AND a."userId" = ${input.actorUserId}::uuid AND a."revokedAt" IS NULL
            AND e."status" = 'ACTIVE' AND u."status" = 'ACTIVE' FOR SHARE OF e, u
        `;
        if (!authorization) throw new CompetencyEligibilityError("This program requires an authorized evaluator to record assessments.");
        evaluatorAuthorizationId = authorization.id;
      }

      if(input.fileId){ const file=await tx.fileObject.findFirst({where:{organizationId:input.organizationId,id:input.fileId},select:{status:true}}); if(!file) throw new Error("Access denied"); if(file.status!=="AVAILABLE") throw new CompetencyEligibilityError("Competency evidence file must be AVAILABLE"); }
      const elements=await tx.$queryRaw<Array<{id:string;required:boolean}>>(Prisma.sql`SELECT "id","required" FROM "CompetencyElement" WHERE "organizationId"=${input.organizationId}::uuid AND "programId"=${input.programId}::uuid`); const byId=new Map(elements.map(e=>[e.id,e])); for(const result of input.elementResults){ if(!byId.has(result.elementId)) throw new Error("Access denied"); }
      for(const element of elements.filter(e=>e.required)){ const result=input.elementResults.find(r=>r.elementId===element.id); if(!result) throw new CompetencyValidationError("All required competency elements must be assessed"); if(result.outcome==="NOT_APPLICABLE") throw new CompetencyValidationError("Required competency elements cannot be not applicable"); }
      const hasRequiredFailure=input.elementResults.some(r=>byId.get(r.elementId)?.required&&r.outcome==="FAIL"); if(input.outcome==="QUALIFIED"&&hasRequiredFailure) throw new CompetencyValidationError("Qualified outcome cannot include a failed required element");
      let expiresAt=input.expiresAt; if(!expiresAt&&input.outcome==="QUALIFIED"&&program.validityDays){ expiresAt=new Date(input.assessedAt); expiresAt.setUTCDate(expiresAt.getUTCDate()+program.validityDays); }
      if(expiresAt&&expiresAt.getTime()<input.assessedAt.getTime()) throw new CompetencyValidationError("Competency expiration cannot precede the assessment date");
      const rows=await tx.$queryRaw<CompetencyAssessmentRecord[]>(Prisma.sql`INSERT INTO "CompetencyAssessment" ("organizationId","employeeId","programId","assessedAt","outcome","expiresAt","assessorUserId","fileId","notes") VALUES (${input.organizationId}::uuid,${input.employeeId}::uuid,${input.programId}::uuid,${input.assessedAt},${input.outcome}::"CompetencyAssessmentOutcome",${expiresAt},${input.actorUserId}::uuid,${input.fileId}::uuid,${input.notes}) RETURNING *`); const assessment=rows[0]; if(!assessment) throw new CompetencyValidationError("Competency assessment could not be recorded");
      for(const result of input.elementResults){ await tx.$executeRaw(Prisma.sql`INSERT INTO "CompetencyAssessmentElement" ("organizationId","assessmentId","elementId","outcome","notes") VALUES (${input.organizationId}::uuid,${assessment.id}::uuid,${result.elementId}::uuid,${result.outcome}::"CompetencyElementOutcome",${result.notes??null})`); }
      await tx.auditEvent.create({data:{organizationId:input.organizationId,actorUserId:input.actorUserId,action:"COMPETENCY_ASSESSED",entityType:"CompetencyAssessment",entityId:assessment.id,metadata:{employeeId:assessment.employeeId,programId:assessment.programId,outcome:assessment.outcome,assessedAt:assessment.assessedAt.toISOString(),expiresAt:assessment.expiresAt?.toISOString()??null,fileId:assessment.fileId,elementCount:input.elementResults.length,evaluatorAuthorizationId}}}); return assessment;
    }, programWriteTransaction);
  }
}
