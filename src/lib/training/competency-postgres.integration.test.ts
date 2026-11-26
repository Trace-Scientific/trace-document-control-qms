import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../db";
import type { AuthorizationContext } from "../security/authorization";
import { cliaCompetencyMethods } from "./clia-competency-methods";
import { PrismaCompetencyStore } from "./competency-store";
import { CompetencyService } from "./competency";

const enabled = process.env.RUN_DEMO_FIXTURE_INTEGRATION === "1";
const disposableUrl = "postgresql://trace_qms_test:local_integration_test_only@127.0.0.1:5433/trace_qms_integration_test?schema=public";

describe.skipIf(!enabled)("CLIA template writes in migrated PostgreSQL", () => {
  const store = new PrismaCompetencyStore();
  const service = new CompetencyService(store);
  let manager: AuthorizationContext;
  let otherManager: AuthorizationContext;
  let employeeId: string;

  async function createTenant(): Promise<AuthorizationContext> {
    const id = randomUUID();
    const organization = await db.organization.create({ data: {
      loginCode: `comp-test-${id}`,
      legalName: "Synthetic Competency Integration Tenant",
      displayName: "Synthetic Competency Integration Tenant",
    } });
    const user = await db.user.create({ data: {
      organizationId: organization.id,
      email: "competency-manager@example.invalid",
      firstName: "Synthetic", lastName: "Manager", status: "ACTIVE",
    } });
    return {
      organizationId: organization.id, userId: user.id, userState: "ACTIVE",
      grants: [{ permission: "training.manage", scopeType: "ORGANIZATION", scopeId: null }],
    };
  }

  beforeAll(async () => {
    expect(process.env.DATABASE_URL).toBe(disposableUrl);
    const [identity] = await db.$queryRaw<{ name: string; username: string }[]>`
      SELECT current_database() AS name, current_user AS username
    `;
    expect(identity).toEqual({ name: "trace_qms_integration_test", username: "trace_qms_test" });

    manager = await createTenant();
    otherManager = await createTenant();
    const [employee] = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO "Employee" ("organizationId", "employeeNumber", "firstName", "lastName")
      VALUES (${manager.organizationId}::uuid, 'TEST-001', 'Synthetic', 'Employee') RETURNING id
    `;
    employeeId = employee.id;
  });

  afterAll(async () => db.$disconnect());

  async function createProgram(context = manager) {
    return service.createProgram(context, {
      organizationId: context.organizationId, code: randomUUID(), title: "Synthetic competency program",
    });
  }

  function saveTemplate(
    programId: string,
    elements: Parameters<CompetencyService["createCliaTemplate"]>[1]["elements"] = [...cliaCompetencyMethods],
  ) {
    return service.createCliaTemplate(manager, { organizationId: manager.organizationId, programId, elements });
  }

  function createElement(programId: string, code = "EXISTING") {
    return service.createElement(manager, { organizationId: manager.organizationId, programId, code, title: "Individual element" });
  }

  function assess(programId: string, elementId: string) {
    return service.createAssessment(manager, {
      organizationId: manager.organizationId, programId, employeeId, assessedAt: new Date(),
      outcome: "QUALIFIED", elementResults: [{ elementId, outcome: "PASS" }],
    });
  }

  const listElements = (programId: string) => store.listElements(manager.organizationId, programId);
  const elementAudits = (programId: string) => db.auditEvent.findMany({ where: {
    organizationId: manager.organizationId,
    action: "COMPETENCY_ELEMENT_CREATED",
    metadata: { path: ["programId"], equals: programId },
  } });

  async function queueProgramWrites<A, B>(programId: string, first: () => Promise<A>, second: () => Promise<B>) {
    // Hold the program row so both writers actually queue at the production lock.
    let results: Promise<[PromiseSettledResult<A>, PromiseSettledResult<B>]> | undefined;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "CompetencyProgram" WHERE id = ${programId}::uuid FOR UPDATE`;
      async function waitForWriters(count: number) {
        const deadline = Date.now() + 2_000;
        do {
          const [row] = await db.$queryRaw<{ count: number }[]>`
            SELECT COUNT(*)::int AS count FROM pg_stat_activity
            WHERE wait_event_type = 'Lock' AND query LIKE '%FROM "CompetencyProgram"%WHERE "organizationId" = %AND "id" = %FOR UPDATE%'
          `;
          if (row.count === count) return;
          await delay(20);
        } while (Date.now() < deadline);
        throw new Error(`Expected ${count} writers queued on the program row`);
      }

      const pendingFirst = Promise.allSettled([first()] as const);
      await waitForWriters(1);
      const pendingSecond = Promise.allSettled([second()] as const);
      results = Promise.all([pendingFirst, pendingSecond]).then(([[a], [b]]) => [a, b]);
      await waitForWriters(2);
    });
    if (!results) throw new Error("Program writes did not start");
    return results;
  }

  it("persists six ordered elements and one correctly attributed audit per element", async () => {
    const program = await createProgram();
    const submitted = cliaCompetencyMethods.map((preset, index) => ({
      ...preset, title: `${preset.title} · Local`, method: `Local instruction ${index + 1}`, required: index !== 1,
    }));
    const created = await saveTemplate(program.id, [...submitted].reverse());

    expect(await listElements(program.id)).toEqual(created);
    expect(created).toMatchObject(submitted.map((element, index) => ({
      ...element, organizationId: manager.organizationId, programId: program.id, sortOrder: index + 1,
    })));
    const audits = await elementAudits(program.id);
    expect(audits).toHaveLength(6);
    expect(audits).toEqual(expect.arrayContaining(created.map((element) => expect.objectContaining({
      entityId: element.id, entityType: "CompetencyElement", actorUserId: manager.userId,
      metadata: { programId: program.id, code: element.code },
    }))));
  });

  it("rejects an inactive or cross-tenant program", async () => {
    const inactive = await createProgram();
    await db.$executeRaw`UPDATE "CompetencyProgram" SET active = false WHERE id = ${inactive.id}::uuid`;
    const other = await createProgram(otherManager);
    await expect(saveTemplate(inactive.id)).rejects.toThrow("Inactive competency program");
    await expect(saveTemplate(other.id)).rejects.toThrow("Access denied");
    expect(await listElements(inactive.id)).toEqual([]);
    expect(await store.listElements(otherManager.organizationId, other.id)).toEqual([]);
  });

  it("rolls back earlier elements and audits if a later code already exists", async () => {
    const program = await createProgram();
    const existing = await createElement(program.id, "CLIA-04");
    await expect(saveTemplate(program.id)).rejects.toThrow("Element code CLIA-04 already exists");
    expect(await listElements(program.id)).toEqual([existing]);
    expect(await elementAudits(program.id)).toMatchObject([{ entityId: existing.id }]);
  });

  it("rolls back earlier writes after a later element insert fails", async () => {
    const program = await createProgram();
    const elements = cliaCompetencyMethods.map((preset) => ({
      ...preset, title: preset.code === "CLIA-04" ? "Synthetic rollback fault" : preset.title, required: true,
    }));
    await db.$executeRaw`
      ALTER TABLE "CompetencyElement" ADD CONSTRAINT "competency_test_fail_element"
      CHECK (title <> 'Synthetic rollback fault') NOT VALID
    `;
    try {
      await expect(saveTemplate(program.id, elements)).rejects.toThrow("competency_test_fail_element");
      expect(await listElements(program.id)).toEqual([]);
      expect(await elementAudits(program.id)).toEqual([]);
    } finally {
      await db.$executeRaw`ALTER TABLE "CompetencyElement" DROP CONSTRAINT "competency_test_fail_element"`;
    }
  });

  it("rolls back all elements and audits if a later audit insert fails", async () => {
    const program = await createProgram();
    await db.$executeRaw`
      ALTER TABLE "AuditEvent" ADD CONSTRAINT "competency_test_fail_audit"
      CHECK (action <> 'COMPETENCY_ELEMENT_CREATED' OR metadata->>'code' <> 'CLIA-04') NOT VALID
    `;
    try {
      await expect(saveTemplate(program.id)).rejects.toThrow("competency_test_fail_audit");
      expect(await listElements(program.id)).toEqual([]);
      expect(await elementAudits(program.id)).toEqual([]);
    } finally {
      await db.$executeRaw`ALTER TABLE "AuditEvent" DROP CONSTRAINT "competency_test_fail_audit"`;
    }
  });

  it("keeps existing qualification history and preserves the legacy single-element workflow", async () => {
    const program = await createProgram();
    const original = await createElement(program.id);
    const assessment = await assess(program.id, original.id);
    await expect(saveTemplate(program.id)).rejects.toThrow("already has assessments");
    expect(await listElements(program.id)).toEqual([original]);
    const added = await createElement(program.id, "INDIVIDUAL");
    expect(await listElements(program.id)).toEqual([original, added]);
    expect(await store.listAssessments(manager.organizationId)).toContainEqual(assessment);
    const results = await db.$queryRaw`
      SELECT "elementId", outcome::text FROM "CompetencyAssessmentElement"
      WHERE "assessmentId" = ${assessment.id}::uuid
    `;
    expect(results).toEqual([{ elementId: original.id, outcome: "PASS" }]);
  });

  it("rejects the bulk template when a competing assessment wins the lock", async () => {
    const program = await createProgram();
    const original = await createElement(program.id);
    const [assessment, template] = await queueProgramWrites(program.id,
      () => assess(program.id, original.id), () => saveTemplate(program.id));
    expect(assessment).toMatchObject({ status: "fulfilled", value: { outcome: "QUALIFIED" } });
    expect(template).toMatchObject({ status: "rejected", reason: expect.objectContaining({ message: expect.stringContaining("already has assessments") }) });
    expect(await listElements(program.id)).toEqual([original]);
  });

  it("validates against the new required elements when the template wins the lock", async () => {
    const program = await createProgram();
    const original = await createElement(program.id);
    const [template, assessment] = await queueProgramWrites(program.id,
      () => saveTemplate(program.id), () => assess(program.id, original.id));
    expect(template).toMatchObject({ status: "fulfilled" });
    expect(assessment).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ message: "All required competency elements must be assessed" }),
    });
    expect(await listElements(program.id)).toHaveLength(7);
    expect((await store.listAssessments(manager.organizationId)).filter((row) => row.programId === program.id)).toEqual([]);
  });

  it("creates just one set of elements and audits for concurrent duplicate submissions", async () => {
    const program = await createProgram();
    const [first, second] = await queueProgramWrites(program.id,
      () => saveTemplate(program.id), () => saveTemplate(program.id));
    expect(first.status).toBe("fulfilled");
    expect(second).toMatchObject({ status: "rejected", reason: expect.objectContaining({ message: expect.stringContaining("already exists") }) });
    expect(await listElements(program.id)).toHaveLength(6);
    expect(await elementAudits(program.id)).toHaveLength(6);
  });
  it("enforces documented program evaluator authorization at assessment save", async () => {
    const program = await createProgram();
    const element = await createElement(program.id);
    const assessmentInput = {
      organizationId: manager.organizationId, programId: program.id, employeeId, assessedAt: new Date(),
      outcome: "QUALIFIED" as const, elementResults: [{ elementId: element.id, outcome: "PASS" as const }],
    };
    const [evaluator] = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO "Employee" ("organizationId", "userId", "employeeNumber", "firstName", "lastName")
      VALUES (${manager.organizationId}::uuid, ${manager.userId}::uuid, 'EVAL-001', 'Synthetic', 'Evaluator')
      RETURNING "id"
    `;
    const file = await db.fileObject.create({ data: {
      organizationId: manager.organizationId, originalName: "synthetic-evaluator-authorization.pdf",
      mimeType: "application/pdf", sizeBytes: 10, sha256: "1".repeat(64),
      status: "AVAILABLE", storageKey: `${manager.organizationId}/${randomUUID()}/synthetic.pdf`,
      uploadedByUserId: manager.userId,
    } });
    const input = {
      organizationId: manager.organizationId, actorUserId: manager.userId, programId: program.id,
      employeeId: evaluator.id, fileId: file.id, basis: "Synthetic written delegation",
    };
    const [ineligible] = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO "Employee" ("organizationId", "employeeNumber", "firstName", "lastName")
      VALUES (${manager.organizationId}::uuid, 'EVAL-002', 'Unlinked', 'Evaluator') RETURNING "id"
    `;
    await expect(store.authorizeEvaluator({ ...input, employeeId: ineligible.id })).rejects.toThrow("active linked account");
    expect(await store.listEvaluatorAuthorizations(manager.organizationId, program.id)).toMatchObject({
      requiresAuthorizedEvaluator: false, authorizations: [],
    });
    await expect(store.listEvaluatorAuthorizations(otherManager.organizationId, program.id)).rejects.toThrow("Access denied");
    const grant = await store.authorizeEvaluator(input);
    expect(await store.listEvaluatorAuthorizations(manager.organizationId, program.id)).toMatchObject({
      requiresAuthorizedEvaluator: true, authorizations: [expect.objectContaining({ id: grant.id, eligible: true })],
    });
    await expect(store.authorizeEvaluator(input)).rejects.toThrow("already authorized");
    const other = await db.user.create({ data: {
      organizationId: manager.organizationId, email: "unlisted@example.invalid", firstName: "Unlisted", lastName: "Evaluator",
    } });
    await expect(service.createAssessment({ ...manager, userId: other.id }, assessmentInput)).rejects.toThrow("requires an authorized evaluator");
    const recorded = await service.createAssessment(manager, assessmentInput);
    expect(await db.auditEvent.findFirst({
      where: { organizationId: manager.organizationId, entityId: recorded.id, action: "COMPETENCY_ASSESSED" },
    })).toMatchObject({ metadata: { evaluatorAuthorizationId: grant.id } });
    await store.revokeEvaluator({ ...input, authorizationId: grant.id, reason: "Synthetic revocation" });
    expect(await store.listEvaluatorAuthorizations(manager.organizationId, program.id)).toMatchObject({
      requiresAuthorizedEvaluator: true, authorizations: [],
    });
    await expect(service.createAssessment(manager, assessmentInput)).rejects.toThrow("requires an authorized evaluator");
    expect((await store.listAssessments(manager.organizationId, employeeId)).map((row) => row.id)).toContain(recorded.id);
  });
});
