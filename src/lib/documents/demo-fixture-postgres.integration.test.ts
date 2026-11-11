import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "../db";
import { DocumentCommandService } from "./service";
import { PrismaDocumentLifecycleStore } from "./prisma-store";
import { PrismaApprovalSignatureStore } from "../signatures/prisma-store";
import { hashApprovalPayload } from "../signatures/payload";
import { ApprovalSignatureService } from "../signatures/service";
import { hashPassword } from "../security/crypto";
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
    // A publisher with permission cannot bypass signature approval by trying to
    // make a draft effective. The state machine must reject before DB writes.
    const earlyPublisher: AuthorizationContext = {
      ...context,
      grants: [{ permission: "document.make_effective", scopeType: "ORGANIZATION", scopeId: null }],
    };
    await expect(service.transition(earlyPublisher, {
      organizationId: org.id, versionId: ids[0],
      command: "MAKE_EFFECTIVE", expectedLockVersion: 0,
    })).rejects.toThrow("Invalid document transition: DRAFT cannot MAKE_EFFECTIVE");
    expect(await db.documentVersion.findUniqueOrThrow({
      where: { id: ids[0] }, select: { status: true, lockVersion: true },
    })).toEqual({ status: "DRAFT", lockVersion: 0 });
    expect(await db.documentReviewTask.count({ where: { organizationId: org.id } })).toBe(0);
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
    // A submitted version is not yet approved: publication is forbidden
    // even for an otherwise authorized publisher.
    await expect(service.transition(earlyPublisher, {
      organizationId: org.id, versionId: ids[0],
      command: "MAKE_EFFECTIVE", expectedLockVersion: 1,
    })).rejects.toThrow("Invalid document transition: IN_REVIEW cannot MAKE_EFFECTIVE");
    expect(await db.documentVersion.findUniqueOrThrow({
      where: { id: ids[0] }, select: { status: true, lockVersion: true },
    })).toEqual({ status: "IN_REVIEW", lockVersion: 1 });
    expect(await db.documentReviewTask.count({ where: { organizationId: org.id } })).toBe(0);
    // Signing before the review task advances to APPROVAL must roll back every write.
    const pendingSignature = {
      organizationId: org.id,
      signerUserId: finalApprover.id,
      documentId: submitted.documentId,
      documentVersionId: ids[0],
      revisionLabel: manifest.documents[0].revision,
      contentHash: versions.find((version) => version.id === ids[0])!.contentHash,
      signedAt: new Date(),
    };
    await expect(new PrismaApprovalSignatureStore().commitApproval({
      ...pendingSignature,
      expectedLockVersion: 1,
      payloadHash: hashApprovalPayload(pendingSignature),
      authenticationValidUntil: new Date(Date.now() + 300_000),
    })).rejects.toThrow("An active review workflow is required");
    expect(await db.documentVersion.findUniqueOrThrow({
      where: { id: ids[0] }, select: { status: true, lockVersion: true },
    })).toEqual({ status: "IN_REVIEW", lockVersion: 1 });
    expect(await db.electronicSignature.count({ where: { organizationId: org.id } })).toBe(0);
    expect(await db.authenticationEvent.count({ where: { organizationId: org.id } })).toBe(0);
    expect(await db.auditEvent.count({
      where: { organizationId: org.id, action: "DOCUMENT_VERSION_APPROVED_WITH_SIGNATURE" },
    })).toBe(0);
    // Simulate the review engine completing the review task; then exercise the
    // actual signature persistence transaction, not a mock signature store.
    await db.workflowTask.updateMany({
      where: { organizationId: org.id, workflowInstanceId: workflow.id, stepKey: "REVIEW_1" },
      data: { status: "COMPLETED", completedAt: new Date(), decision: "APPROVE" },
    });
    await db.workflowTask.updateMany({
      where: { organizationId: org.id, workflowInstanceId: workflow.id, stepKey: "APPROVAL" },
      data: { status: "IN_PROGRESS" },
    });
    await db.workflowInstance.update({
      where: { id: workflow.id }, data: { state: "APPROVAL" },
    });
    // The real service must verify the signer password and explicit signature
    // confirmation before the Prisma store is allowed to persist approval.
    const signingPassword = "Synthetic-approval-password-2026!";
    await db.credential.create({ data: {
      organizationId: org.id, userId: finalApprover.id,
      passwordHash: hashPassword(signingPassword),
    } });
    const signatureService = new ApprovalSignatureService(new PrismaApprovalSignatureStore());
    const signingContext: AuthorizationContext = {
      userId: finalApprover.id, organizationId: org.id, userState: "ACTIVE",
      grants: [{ permission: "document.approve", scopeType: "ORGANIZATION", scopeId: null }],
    };
    await expect(signatureService.signApproval(signingContext, {
      organizationId: org.id, versionId: ids[0], expectedLockVersion: 1,
      password: signingPassword, confirmed: false,
    })).rejects.toThrow("Signature meaning must be confirmed");
    await expect(signatureService.signApproval(signingContext, {
      organizationId: org.id, versionId: ids[0], expectedLockVersion: 1,
      password: "Incorrect-synthetic-password", confirmed: true,
    })).rejects.toThrow("Reauthentication failed");
    expect(await db.electronicSignature.count({ where: { organizationId: org.id } })).toBe(0);
    expect(await db.authenticationEvent.count({
      where: { organizationId: org.id, outcome: "FAILURE" },
    })).toBe(1);
    await expect(signatureService.signApproval({
      ...signingContext, organizationId: otherOrg.id,
    }, {
      organizationId: org.id, versionId: ids[0], expectedLockVersion: 1,
      password: signingPassword, confirmed: true,
    })).rejects.toThrow("Access denied");
    const signedAt = new Date();
    const approvalPayload = { ...pendingSignature, signedAt };
    const payloadHash = hashApprovalPayload(approvalPayload);
    const approved = await signatureService.signApproval(signingContext, {
      organizationId: org.id, versionId: ids[0], expectedLockVersion: 1,
      password: signingPassword, confirmed: true,
    });
    expect(approved?.signatureId).toBeTruthy();
    expect(await db.documentVersion.findUniqueOrThrow({
      where: { id: ids[0] }, select: { status: true, lockVersion: true },
    })).toEqual({ status: "APPROVED", lockVersion: 2 });
    const signature = await db.electronicSignature.findFirstOrThrow({
      where: { organizationId: org.id, documentVersionId: ids[0] },
    });
    expect(signature).toMatchObject({
      id: approved.signatureId, signerUserId: finalApprover.id,
      workflowInstanceId: workflow.id, meaning: "APPROVED",
    });
    const auth = await db.authenticationEvent.findUniqueOrThrow({
      where: { id: signature.authenticationEventId },
    });
    expect(auth).toMatchObject({
      organizationId: org.id, userId: finalApprover.id,
      eventType: "REAUTHENTICATION", outcome: "SUCCESS",
    });
    const approvalAudit = await db.auditEvent.findFirstOrThrow({
      where: { organizationId: org.id, entityId: ids[0], action: "DOCUMENT_VERSION_APPROVED_WITH_SIGNATURE" },
    });
    expect(approvalAudit.actorUserId).toBe(finalApprover.id);
    expect(approvalAudit.metadata).toMatchObject({
      signatureId: signature.id, authenticationEventId: auth.id, payloadHash: signature.payloadHash,
    });
    expect(await db.workflowInstance.findUniqueOrThrow({
      where: { id: workflow.id }, select: { state: true, status: true },
    })).toMatchObject({ state: "APPROVED", status: "COMPLETED" });
    expect(await db.workflowTask.count({
      where: { organizationId: org.id, workflowInstanceId: workflow.id, status: "COMPLETED" },
    })).toBe(2);
    // Service-level replay must be rejected before attempting another signature.
    await expect(signatureService.signApproval(signingContext, {
      organizationId: org.id, versionId: ids[0], expectedLockVersion: 1,
      password: signingPassword, confirmed: true,
    })).rejects.toThrow("Document is not awaiting approval");
    await expect(signatureService.signApproval(signingContext, {
      organizationId: org.id, versionId: ids[0], expectedLockVersion: 2,
      password: signingPassword, confirmed: true,
    })).rejects.toThrow("Document is not awaiting approval");
    // A different tenant's signer cannot read or sign the approved document.
    await expect(signatureService.signApproval({
      ...signingContext, organizationId: otherOrg.id,
    }, {
      organizationId: otherOrg.id, versionId: ids[0], expectedLockVersion: 2,
      password: signingPassword, confirmed: true,
    })).rejects.toThrow("Access denied");
    expect(await db.electronicSignature.count({
      where: { organizationId: org.id, documentVersionId: ids[0] },
    })).toBe(1);
    // A duplicate approval must not create another signature or authentication event.
    expect(await new PrismaApprovalSignatureStore().commitApproval({
      ...approvalPayload, expectedLockVersion: 1, payloadHash,
      authenticationValidUntil: new Date(signedAt.getTime() + 300_000),
    })).toBeNull();
    expect(await db.electronicSignature.count({ where: { organizationId: org.id } })).toBe(1);
    expect(await db.authenticationEvent.count({ where: { organizationId: org.id } })).toBe(2);
    // Effective publication requires a configured review interval; failed
    // publication must not change document state or create a review task.
    const effectiveContext: AuthorizationContext = {
      userId: actor.id, organizationId: org.id, userState: "ACTIVE",
      grants: [{ permission: "document.make_effective", scopeType: "ORGANIZATION", scopeId: null }],
    };
    const publishedEvents: Array<{ eventName: string; eventId: string }> = [];
    const effectiveService = new DocumentCommandService(
      new PrismaDocumentLifecycleStore(), () => new Date(),
      async (event) => { publishedEvents.push({ eventName: event.eventName, eventId: event.eventId }); return []; },
    );
    await expect(effectiveService.transition(effectiveContext, {
      organizationId: org.id, versionId: ids[0],
      command: "MAKE_EFFECTIVE", expectedLockVersion: 2,
    })).rejects.toThrow("A positive review interval is required");
    expect(await db.documentVersion.findUniqueOrThrow({
      where: { id: ids[0] }, select: { status: true, lockVersion: true },
    })).toEqual({ status: "APPROVED", lockVersion: 2 });
    expect(await db.documentReviewTask.count({ where: { organizationId: org.id } })).toBe(0);
    expect(publishedEvents).toHaveLength(0);
    // Publication authorization and tenant boundaries must be enforced before
    // any version mutation or outbound publication event.
    await expect(effectiveService.transition({
      ...effectiveContext, grants: [],
    }, {
      organizationId: org.id, versionId: ids[0],
      command: "MAKE_EFFECTIVE", expectedLockVersion: 2,
    })).rejects.toThrow("Access denied");
    await expect(effectiveService.transition({
      ...effectiveContext, organizationId: otherOrg.id,
    }, {
      organizationId: org.id, versionId: ids[0],
      command: "MAKE_EFFECTIVE", expectedLockVersion: 2,
    })).rejects.toThrow("Access denied");
    expect(publishedEvents).toHaveLength(0);
    expect(await db.documentVersion.findUniqueOrThrow({
      where: { id: ids[0] }, select: { status: true, lockVersion: true },
    })).toEqual({ status: "APPROVED", lockVersion: 2 });
    await db.documentType.update({ where: { id: type.id }, data: { reviewMonths: 12 } });
    const effective = await effectiveService.transition(effectiveContext, {
      organizationId: org.id, versionId: ids[0],
      command: "MAKE_EFFECTIVE", expectedLockVersion: 2,
    });
    expect(effective).toMatchObject({ status: "EFFECTIVE", lockVersion: 3 });
    const effectiveVersion = await db.documentVersion.findUniqueOrThrow({
      where: { id: ids[0] },
    });
    expect(effectiveVersion.status).toBe("EFFECTIVE");
    expect(effectiveVersion.effectiveAt).toBeInstanceOf(Date);
    expect(effectiveVersion.reviewDueAt).toBeInstanceOf(Date);
    expect(await db.document.findUniqueOrThrow({
      where: { id: submitted.documentId }, select: { currentVersionId: true, lifecycleState: true },
    })).toMatchObject({ currentVersionId: ids[0], lifecycleState: "ACTIVE" });
    expect(await db.documentReviewTask.count({
      where: { organizationId: org.id, documentVersionId: ids[0], status: "PENDING" },
    })).toBe(1);
    expect(await db.auditEvent.count({
      where: { organizationId: org.id, entityId: ids[0], action: "DOCUMENT_VERSION_MAKE_EFFECTIVE" },
    })).toBe(1);
    expect(publishedEvents).toEqual([{
      eventName: "document.effective", eventId: `document.effective:${ids[0]}`,
    }]);
    await expect(effectiveService.transition(effectiveContext, {
      organizationId: org.id, versionId: ids[0],
      command: "MAKE_EFFECTIVE", expectedLockVersion: 2,
    })).rejects.toThrow("The document version changed; reload before retrying");
    expect(publishedEvents).toHaveLength(1);
    // Successor revisions must be created only from the current effective
    // version, remain drafts, and preserve the published original.
    const revisionContext: AuthorizationContext = {
      userId: actor.id, organizationId: org.id, userState: "ACTIVE",
      grants: [{ permission: "document.revise", scopeType: "ORGANIZATION", scopeId: null }],
    };
    const revisionText = "SYNTHETIC DEMONSTRATION ONLY — NOT FOR LABORATORY USE\\nRevised controlled procedure.";
    const revisionInput = {
      organizationId: org.id, sourceVersionId: ids[0],
      revisionLabel: "2.0",
      contentText: revisionText,
      contentHash: createHash("sha256").update(revisionText).digest("hex"),
      changeSummary: "Synthetic revision demonstration",
    };
    await expect(service.createRevision({
      ...revisionContext, grants: [],
    }, revisionInput)).rejects.toThrow("Access denied");
    await expect(service.createRevision({
      ...revisionContext, organizationId: otherOrg.id,
    }, revisionInput)).rejects.toThrow("Access denied");
    const successor = await service.createRevision(revisionContext, revisionInput);
    expect(successor).toMatchObject({
      organizationId: org.id, documentId: submitted.documentId,
      versionNumber: 2, revisionLabel: "2.0", status: "DRAFT",
      contentHash: revisionInput.contentHash,
    });
    expect(await db.document.findUniqueOrThrow({
      where: { id: submitted.documentId },
      select: { currentVersionId: true, lifecycleState: true },
    })).toEqual({ currentVersionId: ids[0], lifecycleState: "ACTIVE" });
    expect(await db.documentVersion.findUniqueOrThrow({
      where: { id: ids[0] }, select: { status: true, lockVersion: true },
    })).toEqual({ status: "EFFECTIVE", lockVersion: 3 });
    const successorAudit = await db.auditEvent.findFirstOrThrow({
      where: {
        organizationId: org.id, entityId: successor.id,
        action: "DOCUMENT_SUCCESSOR_REVISION_CREATED",
      },
    });
    expect(successorAudit.metadata).toMatchObject({
      documentId: submitted.documentId, sourceVersionId: ids[0],
      versionNumber: 2, revisionLabel: "2.0",
    });
    await expect(service.createRevision(revisionContext, revisionInput))
      .rejects.toThrow("Complete the existing in-process revision first");
    expect(await db.documentVersion.count({
      where: { organizationId: org.id, documentId: submitted.documentId },
    })).toBe(2);
    // Retirement is restricted, requires a reason, and atomically clears the
    // active pointer and cancels the pending periodic-review task.
    const retireContext: AuthorizationContext = {
      userId: actor.id, organizationId: org.id, userState: "ACTIVE",
      grants: [{ permission: "document.retire", scopeType: "ORGANIZATION", scopeId: null }],
    };
    await expect(effectiveService.transition({
      ...retireContext, grants: [],
    }, {
      organizationId: org.id, versionId: ids[0],
      command: "RETIRE", expectedLockVersion: 3, reason: "Synthetic retirement",
    })).rejects.toThrow("Access denied");
    await expect(effectiveService.transition({
      ...retireContext, organizationId: otherOrg.id,
    }, {
      organizationId: org.id, versionId: ids[0],
      command: "RETIRE", expectedLockVersion: 3, reason: "Synthetic retirement",
    })).rejects.toThrow("Access denied");
    await expect(effectiveService.transition(retireContext, {
      organizationId: org.id, versionId: ids[0],
      command: "RETIRE", expectedLockVersion: 3,
    })).rejects.toThrow("A retirement reason is required");
    expect(await db.documentReviewTask.count({
      where: { organizationId: org.id, documentVersionId: ids[0], status: "PENDING" },
    })).toBe(1);
    expect(await db.documentVersion.findUniqueOrThrow({
      where: { id: ids[0] }, select: { status: true, lockVersion: true },
    })).toEqual({ status: "EFFECTIVE", lockVersion: 3 });
    const retired = await effectiveService.transition(retireContext, {
      organizationId: org.id, versionId: ids[0],
      command: "RETIRE", expectedLockVersion: 3, reason: "Synthetic retirement",
    });
    expect(retired).toMatchObject({ status: "RETIRED", lockVersion: 4 });
    expect(await db.document.findUniqueOrThrow({
      where: { id: submitted.documentId },
      select: { currentVersionId: true, lifecycleState: true },
    })).toEqual({ currentVersionId: null, lifecycleState: "RETIRED" });
    expect(await db.documentReviewTask.count({
      where: { organizationId: org.id, documentVersionId: ids[0], status: "CANCELLED" },
    })).toBe(1);
    const retireAudit = await db.auditEvent.findFirstOrThrow({
      where: { organizationId: org.id, entityId: ids[0], action: "DOCUMENT_VERSION_RETIRE" },
    });
    expect(retireAudit).toMatchObject({
      actorUserId: actor.id, reason: "Synthetic retirement",
    });
    expect(retireAudit.metadata).toMatchObject({ from: "EFFECTIVE", to: "RETIRED" });
    await expect(effectiveService.transition(retireContext, {
      organizationId: org.id, versionId: ids[0],
      command: "RETIRE", expectedLockVersion: 3, reason: "Replay",
    })).rejects.toThrow("The document version changed; reload before retrying");
    expect(await db.auditEvent.count({
      where: { organizationId: org.id, entityId: ids[0], action: "DOCUMENT_VERSION_RETIRE" },
    })).toBe(1);
    expect(publishedEvents).toHaveLength(1);
    // CI destroys this entire disposable PostgreSQL service after the job.
  }, 60000);
});
