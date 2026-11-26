import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../db";
import { PrismaCompetencyStore } from "./competency-store";
import {
  createCompetencyRequirement,
  listCompetencyRequirements,
  retireCompetencyRequirement,
} from "./competency-requirements-store";

const enabled = process.env.RUN_DEMO_FIXTURE_INTEGRATION === "1";
const disposableUrl = "postgresql://trace_qms_test:local_integration_test_only@127.0.0.1:5433/trace_qms_integration_test?schema=public";

describe.skipIf(!enabled)("Competency requirements in migrated PostgreSQL", () => {
  let context: { organizationId: string; actorUserId: string };
  let employeeId: string;
  let endedEmployeeId: string;
  let departmentId: string;
  let jobId: string;
  let programId: string;
  let otherEmployeeId: string;
  let otherOrganizationId: string;

  async function createOrganization() {
    return db.organization.create({ data: {
      loginCode: `matrix-${randomUUID()}`, legalName: "Synthetic matrix tenant", displayName: "Synthetic matrix tenant",
    } });
  }

  async function createEmployee(organizationId: string, employeeNumber: string) {
    const [employee] = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO "Employee" ("organizationId", "employeeNumber", "firstName", "lastName")
      VALUES (${organizationId}::uuid, ${employeeNumber}, 'Synthetic', 'Employee') RETURNING "id"
    `;
    return employee.id;
  }

  beforeAll(async () => {
    expect(process.env.DATABASE_URL).toBe(disposableUrl);
    const [identity] = await db.$queryRaw<{ name: string; username: string }[]>`
      SELECT current_database() AS name, current_user AS username
    `;
    expect(identity).toEqual({ name: "trace_qms_integration_test", username: "trace_qms_test" });
    const organization = await createOrganization();
    otherOrganizationId = (await createOrganization()).id;
    const actor = await db.user.create({ data: {
      organizationId: organization.id, email: "matrix@example.invalid", firstName: "Synthetic", lastName: "Manager",
    } });
    context = { organizationId: organization.id, actorUserId: actor.id };
    programId = (await new PrismaCompetencyStore().createProgram({
      ...context, code: "MATRIX", title: "Synthetic competency program", description: null, validityDays: 365,
    })).id;
    employeeId = await createEmployee(organization.id, "MATRIX-1");
    endedEmployeeId = await createEmployee(organization.id, "MATRIX-2");
    otherEmployeeId = await createEmployee(otherOrganizationId, "MATRIX-1");
    departmentId = (await db.department.create({ data: { organizationId: organization.id, name: "Synthetic department" } })).id;
    const [job] = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO "JobDescription" ("organizationId", "code", "title")
      VALUES (${organization.id}::uuid, 'MATRIX', 'Synthetic role') RETURNING "id"
    `;
    jobId = job.id;
    await db.$executeRaw`
      INSERT INTO "EmployeeJobAssignment" ("organizationId", "employeeId", "jobDescriptionId", "departmentId", "assignedAt", "endedAt", "createdByUserId")
      VALUES
        (${organization.id}::uuid, ${employeeId}::uuid, ${jobId}::uuid, ${departmentId}::uuid, '2000-01-01', NULL, ${actor.id}::uuid),
        (${organization.id}::uuid, ${endedEmployeeId}::uuid, ${jobId}::uuid, ${departmentId}::uuid, '2000-01-01', '2000-01-02', ${actor.id}::uuid)
    `;
  });

  afterAll(async () => db.$disconnect());

  it("resolves overlapping rules, surfaces missing initial assessments, and retains recorded outcomes on retirement", async () => {
    const department = await createCompetencyRequirement({ ...context, programId, scope: "DEPARTMENT", targetId: departmentId });
    const job = await createCompetencyRequirement({ ...context, programId, scope: "JOB", targetId: jobId });
    const employee = await createCompetencyRequirement({ ...context, programId, scope: "EMPLOYEE", targetId: employeeId });
    const getView = () => listCompetencyRequirements(context.organizationId, true);

    const initial = await getView();
    expect(initial.rows).toEqual([expect.objectContaining({
      employeeId, programId, assessment: null,
      requirementIds: [department.id, job.id, employee.id].sort(),
    })]);
    expect(initial.targets.DEPARTMENT).toContainEqual({ id: departmentId, label: "Synthetic department" });
    expect(initial.targets.JOB).toContainEqual({ id: jobId, label: "MATRIX · Synthetic role" });
    expect(initial.targets.EMPLOYEE.map((target) => target.id)).toEqual([employeeId, endedEmployeeId]);
    expect((await listCompetencyRequirements(context.organizationId, false)).targets.EMPLOYEE).toEqual([]);

    await db.$executeRaw`
      INSERT INTO "CompetencyAssessment" ("organizationId", "employeeId", "programId", "assessedAt", "outcome", "expiresAt", "assessorUserId")
      VALUES
        (${context.organizationId}::uuid, ${employeeId}::uuid, ${programId}::uuid, '2000-01-02', 'NOT_QUALIFIED', NULL, ${context.actorUserId}::uuid),
        (${context.organizationId}::uuid, ${employeeId}::uuid, ${programId}::uuid, '2000-01-03', 'QUALIFIED', '2001-01-03', ${context.actorUserId}::uuid)
    `;
    await retireCompetencyRequirement({ ...context, requirementId: employee.id, reason: "Role rule provides coverage" });
    expect((await getView()).rows).toEqual([expect.objectContaining({
      employeeId, programId, assessment: expect.objectContaining({ outcome: "QUALIFIED", expiresAt: "2001-01-03" }),
      requirementIds: [department.id, job.id].sort(),
    })]);
    const events = await db.auditEvent.findMany({
      where: { organizationId: context.organizationId, entityType: "CompetencyRequirement", entityId: employee.id },
    });
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "COMPETENCY_REQUIREMENT_CREATED", actorUserId: context.actorUserId }),
      expect.objectContaining({
        action: "COMPETENCY_REQUIREMENT_RETIRED", actorUserId: context.actorUserId,
        metadata: expect.objectContaining({ reason: "Role rule provides coverage" }),
      }),
    ]));
    expect(await listCompetencyRequirements(otherOrganizationId, true)).toMatchObject({ requirements: [], rows: [] });
  });

  it("limits duplicate writes, rejects foreign targets, and rolls back on audit failure", async () => {
    const input = { ...context, programId, scope: "EMPLOYEE" as const, targetId: endedEmployeeId };
    await expect(createCompetencyRequirement({ ...input, targetId: otherEmployeeId })).rejects.toThrow("Access denied");
    await expect(createCompetencyRequirement({ ...input, actorUserId: randomUUID() })).rejects.toThrow();
    const results = await Promise.allSettled([createCompetencyRequirement(input), createCompetencyRequirement(input)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toEqual([
      expect.objectContaining({ reason: expect.objectContaining({ message: "This requirement already exists." }) }),
    ]);
    const view = await listCompetencyRequirements(context.organizationId, true);
    const [requirement] = view.requirements.filter((rule) => rule.targetId === endedEmployeeId);
    await expect(retireCompetencyRequirement({
      ...context, actorUserId: randomUUID(), requirementId: requirement.id, reason: "Audit transaction test",
    })).rejects.toThrow();
    expect((await listCompetencyRequirements(context.organizationId, true)).requirements).toContainEqual(requirement);
  });
  it("links instrument and reusable test system scope while preserving tenant boundaries", async () => {
    const store = new PrismaCompetencyStore();
    const [instrument] = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO "Equipment" ("organizationId", "equipmentNumber", "name", "status", "createdByUserId")
      VALUES (${context.organizationId}::uuid, 'MATRIX-EQ', 'Synthetic instrument', 'ACTIVE', ${context.actorUserId}::uuid)
      RETURNING "id"
    `;
    const scopedInput = {
      ...context, code: "SCOPED", title: "Scoped program", description: null, validityDays: null,
      equipmentId: instrument.id, newTestSystem: { code: "MATRIX-TS", name: "Synthetic test system" },
    };
    const program = await store.createProgram(scopedInput);
    await createCompetencyRequirement({ ...context, programId: program.id, scope: "EMPLOYEE", targetId: employeeId });
    const visible = await listCompetencyRequirements(context.organizationId, true, true);
    expect(visible.rows.find((row) => row.programId === program.id)?.programLabel).toContain(
      "Test system: MATRIX-TS · Synthetic test system / Instrument: MATRIX-EQ · Synthetic instrument",
    );
    const hidden = await listCompetencyRequirements(context.organizationId, true);
    expect(hidden.rows.find((row) => row.programId === program.id)?.programLabel).toBe(
      "SCOPED · Scoped program · Test system: MATRIX-TS · Synthetic test system",
    );
    const [link] = await db.$queryRaw<{ testSystemId: string }[]>`
      SELECT "testSystemId" FROM "CompetencyProgram" WHERE "id" = ${program.id}::uuid
    `;
    await expect(store.createProgram({
      ...scopedInput, code: "REUSE", newTestSystem: null, testSystemId: link.testSystemId,
    })).resolves.toMatchObject({ code: "REUSE" });
    await expect(store.createProgram({ ...scopedInput, organizationId: otherOrganizationId })).rejects.toThrow("Access denied");
    await expect(store.createProgram({
      ...scopedInput, organizationId: otherOrganizationId, equipmentId: null, newTestSystem: null, testSystemId: link.testSystemId,
    })).rejects.toThrow("Access denied");
    await expect(store.createProgram({
      ...scopedInput, newTestSystem: { code: "ROLLBACK-TS", name: "Rollback test system" },
    })).rejects.toThrow("This competency program code already exists.");
    const systems = await db.$queryRaw<{ code: string }[]>`
      SELECT "code" FROM "CompetencyTestSystem" WHERE "organizationId" = ${context.organizationId}::uuid
    `;
    expect(systems).toEqual([{ code: "MATRIX-TS" }]);
    expect(await db.auditEvent.findFirst({
      where: { organizationId: context.organizationId, entityId: program.id, action: "COMPETENCY_PROGRAM_CREATED" },
    })).toMatchObject({ metadata: { equipmentId: instrument.id, testSystemId: link.testSystemId } });
  });
  it("projects the requirement start and earlier qualified assessment for a scheduled program", async () => {
    const program = await new PrismaCompetencyStore().createProgram({
      ...context, code: "SCHEDULED", title: "Scheduled program", description: null, validityDays: null,
      initialDueDays: 0, reassessmentIntervalDays: 365,
    });
    const rule = await createCompetencyRequirement({ ...context, programId: program.id, scope: "EMPLOYEE", targetId: employeeId });
    const [expected] = await db.$queryRaw<{ startDate: string }[]>`
      SELECT ("createdAt" AT TIME ZONE 'UTC')::date::text AS "startDate"
      FROM "CompetencyRequirement" WHERE "id" = ${rule.id}::uuid
    `;
    const getRow = async () => (await listCompetencyRequirements(context.organizationId, false))
      .rows.find((row) => row.programId === program.id);
    expect(await getRow()).toMatchObject({
      requirementEffectiveOn: expected.startDate, initialDueDays: 0, reassessmentIntervalDays: 365,
      assessment: null, lastQualifiedAt: null, lastQualifiedExpiresAt: null,
    });
    await db.$executeRaw`
      INSERT INTO "CompetencyAssessment" ("organizationId", "employeeId", "programId", "assessedAt", "outcome", "expiresAt", "assessorUserId")
      VALUES
        (${context.organizationId}::uuid, ${employeeId}::uuid, ${program.id}::uuid, '2000-01-04T00:00:00Z', 'QUALIFIED', '2000-10-04', ${context.actorUserId}::uuid),
        (${context.organizationId}::uuid, ${employeeId}::uuid, ${program.id}::uuid, '2000-02-01T00:00:00Z', 'CONDITIONAL', NULL, ${context.actorUserId}::uuid)
    `;
    expect(await getRow()).toMatchObject({
      assessment: { outcome: "CONDITIONAL" }, lastQualifiedAt: "2000-01-04", lastQualifiedExpiresAt: "2000-10-04",
    });
    expect(await db.auditEvent.findFirst({
      where: { organizationId: context.organizationId, entityId: program.id, action: "COMPETENCY_PROGRAM_CREATED" },
    })).toMatchObject({ metadata: { initialDueDays: 0, reassessmentIntervalDays: 365 } });
  });
});
