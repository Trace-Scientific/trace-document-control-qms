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
    { permission: "document.approve", scopeType: "ORGANIZATION", scopeId: null },
  ],
};

function store(version: StoredDocumentVersion | null, succeeds = true) {
  const transitions: Parameters<DocumentLifecycleStore["applyTransition"]>[0][] = [];
  const implementation: DocumentLifecycleStore = {
    async createDraft(input) {
      return { id: "version-new", organizationId: input.organizationId, documentId: "document-new", status: "DRAFT", lockVersion: 0 };
    },
    async findVersion(organizationId, versionId) {
      return version?.organizationId === organizationId && version.id === versionId ? version : null;
    },
    async applyTransition(input) {
      transitions.push(input);
      return succeeds;
    },
  };
  return { implementation, transitions };
}

const draft: StoredDocumentVersion = {
  id: "version-1",
  organizationId: "org-1",
  documentId: "document-1",
  status: "DRAFT",
  lockVersion: 3,
};

describe("document command boundary", () => {
  it("authorizes, transitions, and passes audit evidence to the atomic store", async () => {
    const fixture = store(draft);
    const service = new DocumentCommandService(fixture.implementation, () => new Date("2026-08-24T19:00:00Z"));
    await expect(service.transition(activeContext, {
      organizationId: "org-1",
      versionId: "version-1",
      command: "SUBMIT",
      expectedLockVersion: 3,
    })).resolves.toMatchObject({ status: "IN_REVIEW", lockVersion: 4 });
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
    await expect(service.transition(activeContext, {
      organizationId: "org-2",
      versionId: "version-1",
      command: "SUBMIT",
      expectedLockVersion: 3,
    })).rejects.toThrow("Access denied");
  });

  it("denies missing permissions", async () => {
    const fixture = store({ ...draft, status: "IN_REVIEW" });
    const service = new DocumentCommandService(fixture.implementation);
    await expect(service.transition(activeContext, {
      organizationId: "org-1",
      versionId: "version-1",
      command: "REJECT",
      expectedLockVersion: 3,
      reason: "Incomplete",
    })).rejects.toThrow("Access denied");
  });

  it("rejects stale reads and concurrent lost updates", async () => {
    const fixture = store(draft, false);
    const service = new DocumentCommandService(fixture.implementation);
    await expect(service.transition(activeContext, {
      organizationId: "org-1",
      versionId: "version-1",
      command: "SUBMIT",
      expectedLockVersion: 2,
    })).rejects.toThrow("changed");
    await expect(service.transition(activeContext, {
      organizationId: "org-1",
      versionId: "version-1",
      command: "SUBMIT",
      expectedLockVersion: 3,
    })).rejects.toThrow("changed");
  });
});
