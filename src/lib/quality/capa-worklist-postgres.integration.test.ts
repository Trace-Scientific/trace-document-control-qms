import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../db";
import { PrismaQualityCapaStore } from "./capa-store";
import { findQualityEvidenceFile } from "./evidence-download";
import { PrismaQualityEventStore } from "./events-store";
import { PrismaQualityClosureStore } from "./closure-store";
import { PrismaQualityInvestigationStore } from "./investigations-store";

const enabled = process.env.RUN_DEMO_FIXTURE_INTEGRATION === "1";
const disposableUrl = "postgresql://trace_qms_test:local_integration_test_only@127.0.0.1:5433/trace_qms_integration_test?schema=public";

describe.skipIf(!enabled)("CAPA worklist in migrated PostgreSQL", () => {
  beforeAll(async () => {
    expect(process.env.DATABASE_URL).toBe(disposableUrl);
    const [identity] = await db.$queryRaw<{ name: string; username: string }[]>`
      SELECT current_database() AS name, current_user AS username
    `;
    expect(identity).toEqual({ name: "trace_qms_integration_test", username: "trace_qms_test" });
  });

  afterAll(async () => db.$disconnect());

  async function createTenant() {
    const organization = await db.organization.create({
      data: { loginCode: `capa-${randomUUID()}`, legalName: "Synthetic CAPA tenant", displayName: "Synthetic CAPA tenant" },
    });
    const owner = await db.user.create({
      data: { organizationId: organization.id, email: "capa@example.invalid", firstName: "Synthetic", lastName: "Owner" },
    });
    return { organizationId: organization.id, ownerId: owner.id };
  }

  type Tenant = Awaited<ReturnType<typeof createTenant>>;

  async function createEvent({ organizationId, ownerId }: Tenant, eventNumber: string, closed = false) {
    const [event] = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO "QualityEvent" ("organizationId", "eventNumber", "type", "severity", "status", "summary", "discoveredAt", "reportedByUserId")
      VALUES (${organizationId}::uuid, ${eventNumber}, 'NONCONFORMANCE', 'HIGH',
              ${closed ? "CLOSED" : "VERIFICATION"}::"QualityEventStatus", 'Synthetic event', CURRENT_TIMESTAMP, ${ownerId}::uuid)
      RETURNING "id"
    `;
    return event.id;
  }

  async function createAction({ organizationId, ownerId }: Tenant, eventId: string, description: string, completedAt: Date | null) {
    const [action] = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO "QualityCapaAction" ("organizationId", "eventId", "actionType", "description", "ownerUserId",
                                       "dueAt", "status", "completedAt", "completionEvidence", "createdByUserId")
      VALUES (${organizationId}::uuid, ${eventId}::uuid, 'CORRECTIVE', ${description}, ${ownerId}::uuid,
              '2026-11-01', ${completedAt ? "COMPLETED" : "OPEN"}::"QualityCapaActionStatus",
              ${completedAt}, ${completedAt ? "Synthetic completion evidence" : null}, ${ownerId}::uuid)
      RETURNING "id"
    `;
    return action.id;
  }

  async function recordCheck({ organizationId, ownerId }: Tenant, eventId: string, actionId: string, result: "PASS" | "FAIL", checkedAt = new Date()) {
    await db.$executeRaw`
      INSERT INTO "QualityEffectivenessCheck" ("organizationId", "eventId", "capaActionId", "result", "evidence", "checkedByUserId", "checkedAt")
      VALUES (${organizationId}::uuid, ${eventId}::uuid, ${actionId}::uuid, ${result}::"QualityEffectivenessResult",
              'Synthetic effectiveness evidence', ${ownerId}::uuid, ${checkedAt})
    `;
  }

  it("lists only pending work from its tenant and follows the closure rule for effectiveness", async () => {
    const store = new PrismaQualityCapaStore();
    const tenant = await createTenant();
    const otherTenant = await createTenant();
    const eventId = await createEvent(tenant, "QE-000001");
    const secondEventId = await createEvent(tenant, "QE-000002");
    const closedEventId = await createEvent(tenant, "QE-000003", true);
    const otherEventId = await createEvent(otherTenant, "QE-000001");
    const open = await createAction(tenant, eventId, "Open action", null);
    const pending = await createAction(tenant, secondEventId, "Pending review", new Date("2026-11-02T00:01:00Z"));
    const failed = await createAction(tenant, secondEventId, "Failed review", new Date("2026-11-03T00:01:00Z"));
    await createAction(tenant, closedEventId, "Closed event action", null);
    const other = await createAction(otherTenant, otherEventId, "Other tenant action", null);
    await recordCheck(tenant, secondEventId, failed, "FAIL");

    const first = await store.listWorklist(tenant.organizationId);
    expect(first.map(item => [item.id, item.stage])).toEqual([
      [open, "OPEN"], [pending, "NEEDS_CHECK"], [failed, "FAILED_CHECK"],
    ]);
    expect(first[1]).toEqual(expect.objectContaining({
      eventId: secondEventId, eventNumber: "QE-000002", eventStatus: "VERIFICATION", ownerUserId: tenant.ownerId,
      ownerName: "Synthetic Owner", dueAt: "2026-11-01", completedAt: "2026-11-02",
    }));
    expect(first[1]).not.toHaveProperty("completionEvidence");
    expect((await store.listWorklist(otherTenant.organizationId)).map(item => item.id)).toEqual([other]);

    await recordCheck(tenant, secondEventId, failed, "PASS");
    await recordCheck(tenant, secondEventId, failed, "FAIL");
    expect((await store.listWorklist(tenant.organizationId)).map(item => item.id)).toEqual([open, pending]);
  });

  it("returns all recorded checks newest first only for the requested event and tenant", async () => {
    const store = new PrismaQualityCapaStore();
    const tenant = await createTenant();
    const otherTenant = await createTenant();
    const eventId = await createEvent(tenant, "QE-000001");
    const secondEventId = await createEvent(tenant, "QE-000002");
    const completedAt = new Date("2026-11-01T10:30:00Z");
    const action = await createAction(tenant, eventId, "Reviewed action", completedAt);
    const otherAction = await createAction(tenant, secondEventId, "Separate event action", completedAt);
    const failedAt = new Date("2026-11-02T10:30:00Z");
    const passedAt = new Date("2026-11-03T10:30:00Z");

    await recordCheck(tenant, eventId, action, "FAIL", failedAt);
    await recordCheck(tenant, secondEventId, otherAction, "PASS", passedAt);
    await recordCheck(tenant, eventId, action, "PASS", passedAt);

    const history = await store.listEffectivenessHistory(tenant.organizationId, eventId);
    expect(history).toEqual([
      expect.objectContaining({
        capaActionId: action, result: "PASS", checkedAt: passedAt, checkerName: "Synthetic Owner",
        evidence: "Synthetic effectiveness evidence", evidenceFileId: null,
      }),
      expect.objectContaining({ capaActionId: action, result: "FAIL", checkedAt: failedAt }),
    ]);
    await expect(store.listEffectivenessHistory(otherTenant.organizationId, eventId)).resolves.toEqual([]);
  });

  it("uses current tenant-scoped prerequisites for both readiness and transactional closure", async () => {
    const tenant = await createTenant();
    const otherTenant = await createTenant();
    const eventNumber = "QE-000001";
    const eventId = await createEvent(tenant, eventNumber);
    const store = new PrismaQualityClosureStore();
    const capaStore = new PrismaQualityCapaStore();
    const readiness = () => store.loadReadiness(tenant.organizationId, eventId);
    const sign = () => store.commitClosure({
      organizationId: tenant.organizationId, eventId, eventNumber, signerUserId: tenant.ownerId,
      closureReason: "Synthetic closure", payloadHash: "a".repeat(64),
      signedAt: new Date("2026-11-30T12:00:00Z"), authenticationValidUntil: new Date("2026-11-30T12:05:00Z"),
    });

    await expect(store.loadReadiness(otherTenant.organizationId, eventId)).resolves.toBeNull();
    await expect(readiness()).resolves.toEqual({
      status: "VERIFICATION", hasInvestigation: false, totalActions: 0, openActions: 0, completedWithoutPass: 0,
    });
    await expect(sign()).rejects.toThrow("Investigation evidence is required before closure");
    await db.$executeRaw`
      INSERT INTO "QualityEventInvestigation"
        ("organizationId", "eventId", "sequence", "findings", "affectedScope", "rootCauseMethod",
         "rootCause", "riskLikelihood", "riskImpact", "riskScore", "investigatorUserId")
      VALUES (${tenant.organizationId}::uuid, ${eventId}::uuid, 1, 'Synthetic findings', 'Synthetic scope',
              'FIVE_WHYS', 'Synthetic root cause', 1, 1, 1, ${tenant.ownerId}::uuid)
    `;
    await expect(sign()).rejects.toThrow("At least one CAPA action is required before closure");
    const openAction = await createAction(tenant, eventId, "Pending action", null);
    const completedAction = await createAction(tenant, eventId, "Completed action", new Date("2026-11-02T00:00:00Z"));
    await recordCheck(tenant, eventId, completedAction, "FAIL");

    await expect(readiness()).resolves.toEqual({
      status: "VERIFICATION", hasInvestigation: true, totalActions: 2, openActions: 1, completedWithoutPass: 1,
    });
    await expect(sign()).rejects.toThrow("All CAPA actions must be completed before closure");
    await capaStore.complete({
      organizationId: tenant.organizationId, eventId, capaActionId: openAction, completionEvidence: "Synthetic completion",
      completionEvidenceFileId: null, actorUserId: tenant.ownerId,
    });
    await expect(sign()).rejects.toThrow("Every CAPA action requires a passing effectiveness check before closure");
    await recordCheck(tenant, eventId, completedAction, "PASS");
    await expect(capaStore.verify({
      organizationId: tenant.organizationId, eventId, capaActionId: openAction, actorUserId: tenant.ownerId,
      result: "PASS", evidence: "Synthetic passing check", evidenceFileId: null,
    })).resolves.toMatchObject({ result: "PASS", capaActionId: openAction });
    await expect(readiness()).resolves.toEqual({
      status: "VERIFICATION", hasInvestigation: true, totalActions: 2, openActions: 0, completedWithoutPass: 0,
    });
    await expect(sign()).resolves.toEqual({ closureId: expect.any(String), signatureId: expect.any(String) });
    await expect(readiness()).resolves.toMatchObject({ status: "CLOSED" });
    await expect(new PrismaQualityEventStore().listLifecycleHistory(tenant.organizationId, eventId)).resolves.toEqual([
      expect.objectContaining({
        kind: "STATUS", fromValue: "VERIFICATION", toValue: "CLOSED", actorName: "Synthetic Owner",
        reason: "Synthetic closure",
      }),
    ]);

    const closedAction = { organizationId: tenant.organizationId, eventId, actorUserId: tenant.ownerId };
    const historyBefore = await capaStore.listEffectivenessHistory(tenant.organizationId, eventId);
    await expect(capaStore.verify({
      ...closedAction, capaActionId: completedAction, result: "FAIL", evidence: "Synthetic late check", evidenceFileId: null,
    })).rejects.toThrow("CAPA evidence cannot be changed after quality event closure");
    await expect(capaStore.listEffectivenessHistory(tenant.organizationId, eventId)).resolves.toEqual(historyBefore);

    // Older closed records may contain inconsistent CAPA state. Keep those records read-only too.
    const historicalEventId = await createEvent(tenant, "QE-000002", true);
    const historicalActionId = await createAction(tenant, historicalEventId, "Historical open action", null);
    await expect(capaStore.complete({
      ...closedAction, eventId: historicalEventId, capaActionId: historicalActionId,
      completionEvidence: "Synthetic late completion", completionEvidenceFileId: null,
    })).rejects.toThrow("CAPA evidence cannot be changed after quality event closure");
    await expect(capaStore.list(tenant.organizationId, historicalEventId)).resolves.toEqual([
      expect.objectContaining({ id: historicalActionId, status: "OPEN", completionEvidence: null }),
    ]);
  });

  it("returns complete investigation entries in sequence order within their event and tenant", async () => {
    const tenant = await createTenant();
    const otherTenant = await createTenant();
    const eventId = await createEvent(tenant, "QE-000001");
    const secondEventId = await createEvent(tenant, "QE-000002");
    const store = new PrismaQualityInvestigationStore();
    const input = {
      organizationId: tenant.organizationId, eventId, investigatorUserId: tenant.ownerId,
      findings: "Initial finding", affectedScope: "Synthetic intake workflow",
      evidenceSummary: null, evidenceFileId: null, rootCauseMethod: "FIVE_WHYS" as const,
      rootCause: "Incomplete intake instructions", riskLikelihood: 2, riskImpact: 3,
    };
    const first = await store.create(input);
    await store.create({ ...input, eventId: secondEventId });
    const second = await store.create({
      ...input, findings: "A second finding", evidenceSummary: "Synthetic review notes", riskLikelihood: 4,
    });

    await expect(store.list(tenant.organizationId, eventId)).resolves.toEqual([
      expect.objectContaining({
        id: second.id, sequence: 2, investigatorName: "Synthetic Owner", findings: "A second finding",
        affectedScope: input.affectedScope, rootCause: input.rootCause, riskLikelihood: 4, riskImpact: 3,
        riskScore: 12, evidenceSummary: "Synthetic review notes", createdAt: expect.any(Date),
      }),
      expect.objectContaining({ id: first.id, sequence: 1, findings: "Initial finding", riskScore: 6 }),
    ]);
    await expect(store.list(otherTenant.organizationId, eventId)).resolves.toEqual([]);
  });

  it("returns recorded lifecycle changes for the requested event and tenant", async () => {
    const tenant = await createTenant();
    const otherTenant = await createTenant();
    const eventId = await createEvent(tenant, "QE-000001");
    const secondEventId = await createEvent(tenant, "QE-000002");
    const assignee = await db.user.create({ data: {
      organizationId: tenant.organizationId, email: "assignee@example.invalid", firstName: "Assigned", lastName: "Reviewer",
      status: "ACTIVE",
    } });
    const store = new PrismaQualityEventStore();
    const actor = { organizationId: tenant.organizationId, actorUserId: tenant.ownerId };
    await store.updateLifecycle({
      ...actor, eventId, ownerUserId: assignee.id, dueAt: new Date("2026-12-01"), reason: "Assign for review",
    });
    await store.updateLifecycle({ ...actor, eventId: secondEventId, dueAt: new Date("2026-12-04"), reason: "Separate event" });
    await db.user.update({ where: { id: assignee.id }, data: { status: "INACTIVE" } });
    expect((await store.listEvents(tenant.organizationId, "VERIFICATION")).find(event => event.id === eventId))
      .toMatchObject({ ownerName: "Assigned Reviewer" });
    await expect(store.updateLifecycle({
      ...actor, eventId, ownerUserId: null, reason: "Return to the queue",
    })).resolves.toMatchObject({ ownerUserId: null, status: "VERIFICATION", dueAt: new Date("2026-12-01") });
    await expect(store.updateLifecycle({
      ...actor, eventId, dueAt: null, reason: "Remove the previous deadline",
    })).resolves.toMatchObject({ ownerUserId: null, status: "VERIFICATION", dueAt: null });

    const history = await store.listLifecycleHistory(tenant.organizationId, eventId);
    expect(history).toHaveLength(4);
    expect(history).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "OWNER", fromValue: null, toValue: assignee.id, fromOwnerName: null, toOwnerName: "Assigned Reviewer",
        actorName: "Synthetic Owner", reason: "Assign for review", createdAt: expect.any(Date),
      }),
      expect.objectContaining({
        kind: "OWNER", fromValue: assignee.id, toValue: null, fromOwnerName: "Assigned Reviewer", toOwnerName: null,
        actorName: "Synthetic Owner", reason: "Return to the queue",
      }),
      expect.objectContaining({ kind: "DUE_DATE", fromValue: null, toValue: "2026-12-01", reason: "Assign for review" }),
      expect.objectContaining({ kind: "DUE_DATE", fromValue: "2026-12-01", toValue: null, reason: "Remove the previous deadline" }),
    ]));
    await expect(store.listLifecycleHistory(otherTenant.organizationId, eventId)).resolves.toEqual([]);
  });

  it("returns recorded intake fields only for events in the requested tenant", async () => {
    const tenant = await createTenant();
    const otherTenant = await createTenant();
    const store = new PrismaQualityEventStore();
    const discoveredAt = new Date("2026-11-06T08:45:00Z");
    const report = await store.createEvent({
      organizationId: tenant.organizationId, actorUserId: tenant.ownerId,
      type: "NONCONFORMANCE", severity: "HIGH", source: "MANUAL", summary: "Synthetic incident",
      description: "Original reported description", discoveredAt, ownerUserId: null, dueAt: null,
    });
    await store.updateLifecycle({
      organizationId: tenant.organizationId, actorUserId: tenant.ownerId, eventId: report.id,
      status: "INVESTIGATING", reason: "Begin investigation",
    });

    await expect(store.getIntake(tenant.organizationId, report.id)).resolves.toEqual({
      type: "NONCONFORMANCE", severity: "HIGH", source: "MANUAL", description: "Original reported description",
      reporterName: "Synthetic Owner", discoveredAt, createdAt: report.createdAt,
    });
    await expect(store.getIntake(otherTenant.organizationId, report.id)).resolves.toBeNull();
  });

  it("resolves only available supporting files attached to the selected event", async () => {
    const tenant = await createTenant();
    const otherTenant = await createTenant();
    const eventId = await createEvent(tenant, "QE-000001");
    const otherEventId = await createEvent(tenant, "QE-000002");
    const { organizationId, ownerId } = tenant;

    async function file(name: string, audited: boolean) {
      const uploaded = await db.fileObject.create({ data: {
        organizationId, uploadedByUserId: ownerId, originalName: name, storageKey: `${organizationId}/${randomUUID()}/${name}`,
        mimeType: "text/plain", sizeBytes: 8, sha256: "a".repeat(64), status: "AVAILABLE",
      } });
      if (audited) await db.auditEvent.create({ data: {
        organizationId, actorUserId: ownerId, entityType: "FileObject", entityId: uploaded.id,
        action: "EVIDENCE_FILE_UPLOADED_PENDING_SCAN", newHash: uploaded.sha256, metadata: { evidenceDomain: "QUALITY" },
      } });
      return uploaded;
    }

    const investigationFile = await file("investigation.txt", true);
    const completionFile = await file("legacy.txt", false);
    const effectivenessFile = await file("check.txt", true);
    const unrelatedFile = await file("unrelated.txt", true);
    const action = await createAction(tenant, eventId, "Action requiring evidence", null);
    const capa = new PrismaQualityCapaStore();
    await new PrismaQualityInvestigationStore().create({
      organizationId, eventId, investigatorUserId: ownerId, findings: "Finding", affectedScope: "Synthetic scope",
      evidenceSummary: null, evidenceFileId: investigationFile.id, rootCauseMethod: "FIVE_WHYS", rootCause: "Cause",
      riskLikelihood: 1, riskImpact: 2,
    });
    await capa.complete({
      organizationId, eventId, actorUserId: ownerId, capaActionId: action, completionEvidence: "Complete",
      completionEvidenceFileId: completionFile.id,
    });
    await capa.verify({
      organizationId, eventId, actorUserId: ownerId, capaActionId: action, result: "PASS", evidence: "Verified",
      evidenceFileId: effectivenessFile.id,
    });

    await expect(findQualityEvidenceFile(organizationId, eventId, investigationFile.id, false)).resolves.toMatchObject({ id: investigationFile.id });
    await expect(findQualityEvidenceFile(organizationId, eventId, effectivenessFile.id, false)).resolves.toMatchObject({ id: effectivenessFile.id });
    await expect(findQualityEvidenceFile(organizationId, eventId, completionFile.id, false)).resolves.toBeNull();
    await expect(findQualityEvidenceFile(organizationId, eventId, completionFile.id, true)).resolves.toMatchObject({ id: completionFile.id });
    await expect(findQualityEvidenceFile(organizationId, eventId, unrelatedFile.id, true)).resolves.toBeNull();
    await expect(findQualityEvidenceFile(organizationId, otherEventId, investigationFile.id, true)).resolves.toBeNull();
    await expect(findQualityEvidenceFile(otherTenant.organizationId, eventId, investigationFile.id, true)).resolves.toBeNull();

    await db.fileObject.update({ where: { id: effectivenessFile.id }, data: { status: "QUARANTINED" } });
    await expect(findQualityEvidenceFile(organizationId, eventId, effectivenessFile.id, true)).resolves.toBeNull();
  });
});
