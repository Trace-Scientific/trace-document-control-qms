import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "../db";
import { DocumentCommandService } from "./service";
import { PrismaDocumentLifecycleStore } from "./prisma-store";
import type { AuthorizationContext } from "../security/authorization";

const expected = "postgresql://trace_qms_test:local_integration_test_only@127.0.0.1:5433/trace_qms_integration_test?schema=public";
const enabled = process.env.RUN_DEMO_FIXTURE_INTEGRATION === "1";
const fixtureRoot = resolve(process.cwd(), "fixtures/demo");

describe.skipIf(!enabled)("demo fixtures through real service and migrated PostgreSQL", () => {
  it("creates six synthetic drafts and authentic audit records in a disposable database", async () => {
    expect(process.env.DATABASE_URL).toBe(expected);
    const identity = await db.$queryRaw<Array<{ name: string; username: string }>>`SELECT current_database() AS name, current_user AS username`;
    expect(identity[0]).toMatchObject({ name: "trace_qms_integration_test", username: "trace_qms_test" });
    const manifest = JSON.parse(readFileSync(resolve(fixtureRoot, "manifest.json"), "utf8")) as {
      documents: Array<{ id: string; title: string; revision: string; path: string }>;
    };
    const org = await db.organization.create({ data: {
      loginCode: "fixture-service-smoke-isolated",
      legalName: "Synthetic Service Test Laboratory",
      displayName: "Synthetic Service Test Laboratory",
      active: false,
    } });
    const actor = await db.user.create({ data: {
      organizationId: org.id, email: "fixture-service-author@example.invalid",
      firstName: "Synthetic", lastName: "Author", status: "ACTIVE",
    } });
    const type = await db.documentType.create({ data: {
      organizationId: org.id, code: "DEMO", name: "Synthetic Demonstration",
    } });
    const context: AuthorizationContext = {
      userId: actor.id, organizationId: org.id, userState: "ACTIVE",
      grants: [{ permission: "document.create", scopeType: "ORGANIZATION", scopeId: null }],
    };
    const service = new DocumentCommandService(new PrismaDocumentLifecycleStore());
    const ids: string[] = [];
    for (const item of manifest.documents) {
      const contentText = readFileSync(resolve(fixtureRoot, item.path), "utf8");
      const created = await service.createDraft(context, {
        organizationId: org.id, documentTypeId: type.id,
        documentNumber: item.id, title: item.title + " — DEMO",
        versionNumber: 1, revisionLabel: item.revision,
        contentHash: createHash("sha256").update(contentText).digest("hex"),
        contentText, changeSummary: "Initial synthetic demo draft",
      });
      expect(created.status).toBe("DRAFT");
      ids.push(created.id);
    }
    expect(ids).toHaveLength(6);
    expect(await db.document.count({ where: { organizationId: org.id } })).toBe(6);
    expect(await db.documentVersion.count({ where: { organizationId: org.id, status: "DRAFT" } })).toBe(6);
    const audits = await db.auditEvent.findMany({ where: {
      organizationId: org.id, action: "DOCUMENT_DRAFT_CREATED",
    } });
    expect(audits).toHaveLength(6);
    expect(new Set(audits.map((event) => event.entityId))).toEqual(new Set(ids));
    expect(audits.every((event) => event.actorUserId === actor.id)).toBe(true);
    expect(audits.every((event) => event.entityType === "DocumentVersion")).toBe(true);
    const versions = await db.documentVersion.findMany({
      where: { organizationId: org.id },
      select: { id: true, documentId: true, contentHash: true, contentText: true, status: true },
    });
    expect(versions).toHaveLength(6);
    for (const version of versions) {
      expect(version.status).toBe("DRAFT");
      expect(version.contentText).toContain("SYNTHETIC — DEMONSTRATION ONLY — NOT FOR LABORATORY USE");
      expect(createHash("sha256").update(version.contentText ?? "").digest("hex")).toBe(version.contentHash);
      const audit = audits.find((event) => event.entityId === version.id);
      expect(audit).toBeDefined();
      expect(audit?.metadata).toMatchObject({
        documentId: version.documentId,
        contentHash: version.contentHash,
      });
    }
    const otherOrg = await db.organization.create({ data: {
      loginCode: "fixture-service-other-isolated", legalName: "Other Synthetic Lab",
      displayName: "Other Synthetic Lab", active: false,
    } });
    expect(await db.document.count({ where: { organizationId: otherOrg.id } })).toBe(0);
    await expect(service.createDraft({ ...context, organizationId: otherOrg.id }, {
      organizationId: org.id, documentTypeId: type.id,
      documentNumber: "CROSS-TENANT", title: "Forbidden",
      versionNumber: 1, revisionLabel: "0.1",
      contentHash: "a".repeat(64), contentText: "Synthetic denied",
      changeSummary: "Denied",
    })).rejects.toThrow("Access denied");
    expect(await db.document.count({ where: { organizationId: org.id } })).toBe(6);
    // A real store transition must fail atomically when the approval workflow is absent.
    const submitter: AuthorizationContext = {
      ...context,
      grants: [{ permission: "document.submit", scopeType: "ORGANIZATION", scopeId: null }],
    };
    await expect(service.transition(submitter, {
      organizationId: org.id,
      versionId: ids[0],
      command: "SUBMIT",
      expectedLockVersion: 0,
      approverUserId: actor.id,
    })).rejects.toThrow("An active document-approval workflow is required");
    const unchanged = await db.documentVersion.findUniqueOrThrow({
      where: { id: ids[0] },
      select: { status: true, lockVersion: true },
    });
    expect(unchanged).toEqual({ status: "DRAFT", lockVersion: 0 });
    expect(await db.workflowInstance.count({ where: { organizationId: org.id } })).toBe(0);
    expect(await db.auditEvent.count({ where: { organizationId: org.id } })).toBe(6);
    // Approval must be routed through electronic signatures, never the generic command.
    const approverContext: AuthorizationContext = {
      ...context,
      grants: [{ permission: "document.approve", scopeType: "ORGANIZATION", scopeId: null }],
    };
    await expect(service.transition(approverContext, {
      organizationId: org.id,
      versionId: ids[0],
      command: "APPROVE",
      expectedLockVersion: 0,
    })).rejects.toThrow("Electronic signature is required for approval");
    expect(await db.documentVersion.findUniqueOrThrow({
      where: { id: ids[0] },
      select: { status: true, lockVersion: true },
    })).toEqual({ status: "DRAFT", lockVersion: 0 });
    expect(await db.auditEvent.count({ where: { organizationId: org.id } })).toBe(6);
    // Real tenant-scoped store reads must not disclose another tenant's document.
    const store = new PrismaDocumentLifecycleStore();
    expect(await store.findVersion(otherOrg.id, ids[0])).toBeNull();
    expect(await store.findVersion(org.id, ids[0])).toMatchObject({
      id: ids[0], organizationId: org.id, status: "DRAFT",
    });
    // Optimistic concurrency must reject stale commands before any workflow writes.
    await expect(service.transition(submitter, {
      organizationId: org.id,
      versionId: ids[0],
      command: "SUBMIT",
      expectedLockVersion: 1,
      approverUserId: actor.id,
    })).rejects.toThrow("The document version changed; reload before retrying");
    // Cross-tenant submission is rejected before the database transition path.
    await expect(service.transition({
      ...submitter, organizationId: otherOrg.id,
    }, {
      organizationId: org.id,
      versionId: ids[0],
      command: "SUBMIT",
      expectedLockVersion: 0,
      approverUserId: actor.id,
    })).rejects.toThrow("Access denied");
    expect(await db.workflowInstance.count({ where: { organizationId: org.id } })).toBe(0);
    expect(await db.notificationOutbox.count({ where: { organizationId: org.id } })).toBe(0);
    expect(await db.auditEvent.count({ where: { organizationId: org.id } })).toBe(6);
    // Positive-path submission persists review tasks, approval separation and audit atomically.
    const reviewer = await db.user.create({ data: {
      organizationId: org.id, email: "fixture-reviewer@example.invalid",
      firstName: "Synthetic", lastName: "Reviewer", status: "ACTIVE",
    } });
    const finalApprover = await db.user.create({ data: {
      organizationId: org.id, email: "fixture-approver@example.invalid",
      firstName: "Synthetic", lastName: "Approver", status: "ACTIVE",
    } });
    const reviewPermission = await db.permission.upsert({
      where: { key: "document.review" }, update: {},
      create: { key: "document.review" },
    });
    const approvalPermission = await db.permission.upsert({
      where: { key: "document.approve" }, update: {},
      create: { key: "document.approve" },
    });
    const reviewRole = await db.role.create({ data: {
      organizationId: org.id, name: "Synthetic reviewer",
    } });
    const approvalRole = await db.role.create({ data: {
      organizationId: org.id, name: "Synthetic approver",
    } });
    await db.rolePermission.createMany({ data: [
      { roleId: reviewRole.id, permissionId: reviewPermission.id },
      { roleId: approvalRole.id, permissionId: approvalPermission.id },
    ] });
    await db.userRole.createMany({ data: [
      { organizationId: org.id, userId: reviewer.id, roleId: reviewRole.id },
      { organizationId: org.id, userId: finalApprover.id, roleId: approvalRole.id },
    ] });
    await db.workflowDefinition.create({ data: {
      organizationId: org.id, key: "document-approval", version: 1,
      name: "Synthetic document approval", active: true, definition: {},
    } });
    const dueAt = new Date(Date.now() + 7 * 86_400_000);
    const submitted = await service.transition(submitter, {
      organizationId: org.id, versionId: ids[0], command: "SUBMIT",
      expectedLockVersion: 0, assigneeUserIds: [reviewer.id],
      approverUserId: finalApprover.id, dueAt,
      comment: "Synthetic review assignment",
    });
    expect(submitted).toMatchObject({ status: "IN_REVIEW", lockVersion: 1 });
    expect(await db.documentVersion.findUniqueOrThrow({
      where: { id: ids[0] }, select: { status: true, lockVersion: true },
    })).toEqual({ status: "IN_REVIEW", lockVersion: 1 });
    const workflow = await db.workflowInstance.findFirstOrThrow({
      where: { organizationId: org.id, entityId: ids[0] },
    });
    expect(workflow.state).toBe("REVIEW");
    const tasks = await db.workflowTask.findMany({
      where: { organizationId: org.id, workflowInstanceId: workflow.id },
    });
    expect(tasks).toHaveLength(2);
    expect(tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ stepKey: "REVIEW_1", assigneeUserId: reviewer.id, status: "IN_PROGRESS" }),
      expect.objectContaining({ stepKey: "APPROVAL", assigneeUserId: finalApprover.id, status: "PENDING" }),
    ]));
    expect(await db.notificationOutbox.count({
      where: { organizationId: org.id, recipientUserId: reviewer.id },
    })).toBe(1);
    const submitAudit = await db.auditEvent.findFirstOrThrow({
      where: { organizationId: org.id, entityId: ids[0], action: "DOCUMENT_VERSION_SUBMIT" },
    });
    expect(submitAudit.actorUserId).toBe(actor.id);
    expect(submitAudit.metadata).toMatchObject({
      from: "DRAFT", to: "IN_REVIEW", approverUserId: finalApprover.id,
    });
    await expect(service.transition(submitter, {
      organizationId: org.id, versionId: ids[0], command: "SUBMIT",
      expectedLockVersion: 0, approverUserId: finalApprover.id,
    })).rejects.toThrow("The document version changed; reload before retrying");
    expect(await db.workflowInstance.count({ where: { organizationId: org.id } })).toBe(1);
    // CI destroys this entire disposable PostgreSQL service after the job.
  }, 60000);
});
