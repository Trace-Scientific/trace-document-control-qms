import { describe, expect, it } from "vitest";
import type { AuthorizationContext } from "../security/authorization";
import {
  DocumentCommandService,
  type DocumentLifecycleStore,
  type StoredDocumentVersion,
} from "./service";

const activeContext: AuthorizationContext = {
  userId: "user-1",
  organizationId: "org-1",
  userState: "ACTIVE",
  grants: [
    { permission: "document.create", scopeType: "ORGANIZATION", scopeId: null },
    { permission: "document.submit", scopeType: "ORGANIZATION", scopeId: null },
    {
      permission: "document.approve",
      scopeType: "ORGANIZATION",
      scopeId: null,
    },
  ],
};

function store(version: StoredDocumentVersion | null, succeeds = true) {
  const transitions: Parameters<
    DocumentLifecycleStore["applyTransition"]
  >[0][] = [];
  const drafts: Parameters<DocumentLifecycleStore["createDraft"]>[0][] = [];
  const updates: Parameters<DocumentLifecycleStore["updateDraft"]>[0][] = [];
  const revisions: Parameters<DocumentLifecycleStore["createRevision"]>[0][] =
    [];
  const implementation: DocumentLifecycleStore = {
    async createDraft(input) {
      drafts.push(input);
      return {
        id: "version-new",
        organizationId: input.organizationId,
        documentId: "document-new",
        status: "DRAFT",
        lockVersion: 0,
      };
    },
    async updateDraft(input) {
      updates.push(input);
      return succeeds;
    },
    async createRevision(input) {
      revisions.push(input);
      return {
        id: "revision-new",
        organizationId: input.organizationId,
        documentId: "document-1",
        status: "DRAFT",
        lockVersion: 0,
      };
    },
    async findVersion(organizationId, versionId) {
      return version?.organizationId === organizationId &&
        version.id === versionId
        ? version
        : null;
    },
    async applyTransition(input) {
      transitions.push(input);
      return succeeds;
    },
  };
  return { implementation, transitions, drafts, updates, revisions };
}

const draft: StoredDocumentVersion = {
  id: "version-1",
  organizationId: "org-1",
  documentId: "document-1",
  status: "DRAFT",
  lockVersion: 3,
};

describe("document command boundary", () => {
  it("persists required draft content with the authorized actor", async () => {
    const fixture = store(null);
    const service = new DocumentCommandService(fixture.implementation);
    await expect(
      service.createDraft(activeContext, {
        organizationId: "org-1",
        documentTypeId: "type-1",
        documentNumber: " SOP-100 ",
        title: "Sample handling",
        versionNumber: 1,
        revisionLabel: "0.1",
        contentHash: "a".repeat(64),
        contentText: "Collect the sample using the validated kit.",
        changeSummary: "Initial draft",
      }),
    ).resolves.toMatchObject({ status: "DRAFT" });
    expect(fixture.drafts[0]).toMatchObject({
      actorUserId: "user-1",
      contentText: "Collect the sample using the validated kit.",
    });
  });

  it("rejects blank or oversized controlled content", async () => {
    const service = new DocumentCommandService(store(null).implementation);
    const input = {
      organizationId: "org-1",
      documentTypeId: "type-1",
      documentNumber: "SOP-100",
      title: "Sample handling",
      versionNumber: 1,
      revisionLabel: "0.1",
      contentHash: "a".repeat(64),
      changeSummary: "Initial draft",
    };
    await expect(
      service.createDraft(activeContext, { ...input, contentText: "   " }),
    ).rejects.toThrow("content is required");
    await expect(
      service.createDraft(activeContext, {
        ...input,
        contentText: "a".repeat(1_000_001),
      }),
    ).rejects.toThrow("too large");
  });

  it("updates only an authorized, current draft revision", async () => {
    const fixture = store(draft),
      service = new DocumentCommandService(
        fixture.implementation,
        () => new Date("2026-08-25T00:00:00Z"),
      );
    await expect(
      service.updateDraft(activeContext, {
        organizationId: "org-1",
        versionId: "version-1",
        expectedLockVersion: 3,
        contentHash: "b".repeat(64),
        contentText: "Revised controlled content",
        changeSummary: "Clarified collection step",
      }),
    ).resolves.toEqual({ status: "DRAFT", lockVersion: 4 });
    expect(fixture.updates[0]).toMatchObject({
      actorUserId: "user-1",
      expectedLockVersion: 3,
    });
    await expect(
      new DocumentCommandService(
        store(draft, false).implementation,
      ).updateDraft(activeContext, {
        organizationId: "org-1",
        versionId: "version-1",
        expectedLockVersion: 3,
        contentHash: "b".repeat(64),
        contentText: "Revised",
        changeSummary: "Change",
      }),
    ).rejects.toThrow("changed");
  });

  it("creates a successor revision with server-validated evidence", async () => {
    const fixture = store(draft),
      service = new DocumentCommandService(
        fixture.implementation,
        () => new Date("2026-08-25T00:00:00Z"),
      );
    await expect(
      service.createRevision(activeContext, {
        organizationId: "org-1",
        sourceVersionId: "version-1",
        revisionLabel: "2.0",
        contentHash: "c".repeat(64),
        contentText: "Successor controlled content",
        changeSummary: "Annual revision",
      }),
    ).resolves.toMatchObject({ id: "revision-new", status: "DRAFT" });
    expect(fixture.revisions[0]).toMatchObject({
      actorUserId: "user-1",
      sourceVersionId: "version-1",
    });
  });

  it("passes revision-specific assignment evidence on submission", async () => {
    const fixture = store(draft),
      service = new DocumentCommandService(
        fixture.implementation,
        () => new Date("2026-08-25T00:00:00Z"),
      );
    await service.transition(activeContext, {
      organizationId: "org-1",
      versionId: "version-1",
      command: "SUBMIT",
      expectedLockVersion: 3,
      assigneeUserId: "reviewer-1",
      dueAt: new Date("2026-09-01T00:00:00Z"),
      comment: "Review the collection changes",
    });
    expect(fixture.transitions[0]).toMatchObject({
      assigneeUserId: "reviewer-1",
      comment: "Review the collection changes",
    });
  });

  it("authorizes, transitions, and passes audit evidence to the atomic store", async () => {
    const fixture = store(draft);
    const service = new DocumentCommandService(
      fixture.implementation,
      () => new Date("2026-08-24T19:00:00Z"),
    );
    await expect(
      service.transition(activeContext, {
        organizationId: "org-1",
        versionId: "version-1",
        command: "SUBMIT",
        expectedLockVersion: 3,
      }),
    ).resolves.toMatchObject({ status: "IN_REVIEW", lockVersion: 4 });
    expect(fixture.transitions[0]).toMatchObject({
      actorUserId: "user-1",
      from: "DRAFT",
      to: "IN_REVIEW",
      expectedLockVersion: 3,
    });
  });

  it("denies cross-tenant access before resource lookup", async () => {
    const fixture = store(draft);
    const service = new DocumentCommandService(fixture.implementation);
    await expect(
      service.transition(activeContext, {
        organizationId: "org-2",
        versionId: "version-1",
        command: "SUBMIT",
        expectedLockVersion: 3,
      }),
    ).rejects.toThrow("Access denied");
  });

  it("denies missing permissions", async () => {
    const fixture = store({ ...draft, status: "IN_REVIEW" });
    const service = new DocumentCommandService(fixture.implementation);
    await expect(
      service.transition(activeContext, {
        organizationId: "org-1",
        versionId: "version-1",
        command: "REJECT",
        expectedLockVersion: 3,
        reason: "Incomplete",
      }),
    ).rejects.toThrow("Access denied");
  });

  it("rejects stale reads and concurrent lost updates", async () => {
    const fixture = store(draft, false);
    const service = new DocumentCommandService(fixture.implementation);
    await expect(
      service.transition(activeContext, {
        organizationId: "org-1",
        versionId: "version-1",
        command: "SUBMIT",
        expectedLockVersion: 2,
      }),
    ).rejects.toThrow("changed");
    await expect(
      service.transition(activeContext, {
        organizationId: "org-1",
        versionId: "version-1",
        command: "SUBMIT",
        expectedLockVersion: 3,
      }),
    ).rejects.toThrow("changed");
  });

  it("rejects unsigned approval through the generic command boundary", async () => {
    const fixture = store({ ...draft, status: "IN_REVIEW" });
    const service = new DocumentCommandService(fixture.implementation);
    await expect(
      service.transition(activeContext, {
        organizationId: "org-1",
        versionId: "version-1",
        command: "APPROVE",
        expectedLockVersion: 3,
      }),
    ).rejects.toThrow("Electronic signature is required");
  });
});
