import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DocumentCommandService, type DocumentLifecycleStore } from "./service";
import type { AuthorizationContext } from "../security/authorization";

const fixtureRoot = resolve(process.cwd(), "fixtures/demo");
const manifest = JSON.parse(readFileSync(resolve(fixtureRoot, "manifest.json"), "utf8")) as {
  documents: Array<{ id: string; title: string; revision: string; path: string }>;
};

describe("synthetic demo documents through QMS DocumentCommandService", () => {
  it("creates six drafts with actual service authorization and validation", async () => {
    const createDraft = vi.fn(async (input: Parameters<DocumentLifecycleStore["createDraft"]>[0]) => ({
      id: "00000000-0000-4000-8000-000000000001",
      organizationId: input.organizationId,
      documentId: "00000000-0000-4000-8000-000000000002",
      status: "DRAFT" as const,
      lockVersion: 0,
    }));
    const store = { createDraft } as unknown as DocumentLifecycleStore;
    const service = new DocumentCommandService(store);
    const context: AuthorizationContext = {
      userId: "00000000-0000-4000-8000-000000000003",
      organizationId: "00000000-0000-4000-8000-000000000004",
      userState: "ACTIVE",
      grants: [{ permission: "document.create", scopeType: "ORGANIZATION", scopeId: null }],
    };
    for (const item of manifest.documents) {
      const contentText = readFileSync(resolve(fixtureRoot, item.path), "utf8");
      const result = await service.createDraft(context, {
        organizationId: context.organizationId,
        documentTypeId: "00000000-0000-4000-8000-000000000005",
        documentNumber: item.id,
        title: item.title + " — DEMO",
        versionNumber: 1,
        revisionLabel: item.revision,
        contentHash: createHash("sha256").update(contentText).digest("hex"),
        contentText,
        changeSummary: "Initial fictional demonstration draft",
      });
      expect(result.status).toBe("DRAFT");
    }
    expect(createDraft).toHaveBeenCalledTimes(6);
    for (const [index, item] of manifest.documents.entries()) {
      expect(createDraft.mock.calls[index][0]).toMatchObject({
        documentNumber: item.id, actorUserId: context.userId,
        organizationId: context.organizationId,
      });
    }
    await expect(service.createDraft({ ...context, grants: [] }, {
      organizationId: context.organizationId,
      documentTypeId: "00000000-0000-4000-8000-000000000005",
      documentNumber: "DENIED", title: "Denied", versionNumber: 1,
      revisionLabel: "0.1", contentHash: "a".repeat(64),
      contentText: "Synthetic denied example", changeSummary: "Denied",
    })).rejects.toThrow("Access denied");
    await expect(service.createDraft({ ...context, organizationId: "00000000-0000-4000-8000-000000000099" }, {
      organizationId: context.organizationId,
      documentTypeId: "00000000-0000-4000-8000-000000000005",
      documentNumber: "CROSS-TENANT", title: "Denied", versionNumber: 1,
      revisionLabel: "0.1", contentHash: "a".repeat(64),
      contentText: "Synthetic cross-tenant denial", changeSummary: "Denied",
    })).rejects.toThrow("Access denied");
    await expect(service.createDraft(context, {
      organizationId: context.organizationId,
      documentTypeId: "00000000-0000-4000-8000-000000000005",
      documentNumber: "BAD-HASH", title: "Denied", versionNumber: 1,
      revisionLabel: "0.1", contentHash: "not-a-sha256",
      contentText: "Synthetic invalid digest", changeSummary: "Denied",
    })).rejects.toThrow();
    expect(createDraft).toHaveBeenCalledTimes(6);
  });
  it("rejects an unauthorized review submission before accessing the store", async () => {
    const findVersion = vi.fn();
    const applyTransition = vi.fn();
    const service = new DocumentCommandService({
      findVersion, applyTransition,
    } as unknown as DocumentLifecycleStore);
    const context: AuthorizationContext = {
      userId: "00000000-0000-4000-8000-000000000003",
      organizationId: "00000000-0000-4000-8000-000000000004",
      userState: "ACTIVE",
      grants: [],
    };
    await expect(service.transition(context, {
      organizationId: context.organizationId,
      versionId: "00000000-0000-4000-8000-000000000001",
      command: "SUBMIT",
      expectedLockVersion: 0,
    })).rejects.toThrow("Access denied");
    expect(findVersion).not.toHaveBeenCalled();
    expect(applyTransition).not.toHaveBeenCalled();
  });

  it("requires a distinct final approver before submitting a synthetic draft", async () => {
    const findVersion = vi.fn(async () => ({
      id: "00000000-0000-4000-8000-000000000001",
      organizationId: "00000000-0000-4000-8000-000000000004",
      documentId: "00000000-0000-4000-8000-000000000002",
      status: "DRAFT" as const,
      lockVersion: 0,
    }));
    const applyTransition = vi.fn();
    const service = new DocumentCommandService({
      findVersion, applyTransition,
    } as unknown as DocumentLifecycleStore);
    const context: AuthorizationContext = {
      userId: "00000000-0000-4000-8000-000000000003",
      organizationId: "00000000-0000-4000-8000-000000000004",
      userState: "ACTIVE",
      grants: [{ permission: "document.submit", scopeType: "ORGANIZATION", scopeId: null }],
    };
    await expect(service.transition(context, {
      organizationId: context.organizationId,
      versionId: "00000000-0000-4000-8000-000000000001",
      command: "SUBMIT",
      expectedLockVersion: 0,
    })).rejects.toThrow("A final approver is required");
    expect(applyTransition).not.toHaveBeenCalled();
  });

  it("rejects a stale lock version before applying a review transition", async () => {
    const findVersion = vi.fn(async () => ({
      id: "00000000-0000-4000-8000-000000000001",
      organizationId: "00000000-0000-4000-8000-000000000004",
      documentId: "00000000-0000-4000-8000-000000000002",
      status: "DRAFT" as const,
      lockVersion: 2,
    }));
    const applyTransition = vi.fn();
    const service = new DocumentCommandService({
      findVersion, applyTransition,
    } as unknown as DocumentLifecycleStore);
    const context: AuthorizationContext = {
      userId: "00000000-0000-4000-8000-000000000003",
      organizationId: "00000000-0000-4000-8000-000000000004",
      userState: "ACTIVE",
      grants: [{ permission: "document.submit", scopeType: "ORGANIZATION", scopeId: null }],
    };
    await expect(service.transition(context, {
      organizationId: context.organizationId,
      versionId: "00000000-0000-4000-8000-000000000001",
      command: "SUBMIT",
      expectedLockVersion: 1,
      approverUserId: "00000000-0000-4000-8000-000000000006",
    })).rejects.toThrow();
    expect(applyTransition).not.toHaveBeenCalled();
  });

  it("does not let an inactive user submit a draft for review", async () => {
    const findVersion = vi.fn();
    const applyTransition = vi.fn();
    const service = new DocumentCommandService({
      findVersion, applyTransition,
    } as unknown as DocumentLifecycleStore);
    const context: AuthorizationContext = {
      userId: "00000000-0000-4000-8000-000000000003",
      organizationId: "00000000-0000-4000-8000-000000000004",
      userState: "SUSPENDED",
      grants: [{ permission: "document.submit", scopeType: "ORGANIZATION", scopeId: null }],
    };
    await expect(service.transition(context, {
      organizationId: context.organizationId,
      versionId: "00000000-0000-4000-8000-000000000001",
      command: "SUBMIT",
      expectedLockVersion: 0,
      approverUserId: "00000000-0000-4000-8000-000000000006",
    })).rejects.toThrow("Access denied");
    expect(findVersion).not.toHaveBeenCalled();
    expect(applyTransition).not.toHaveBeenCalled();
  });

  it("rejects a final approver who is also an assigned reviewer", async () => {
    const findVersion = vi.fn(async () => ({
      id: "00000000-0000-4000-8000-000000000001",
      organizationId: "00000000-0000-4000-8000-000000000004",
      documentId: "00000000-0000-4000-8000-000000000002",
      status: "DRAFT" as const,
      lockVersion: 0,
    }));
    const applyTransition = vi.fn();
    const service = new DocumentCommandService({
      findVersion, applyTransition,
    } as unknown as DocumentLifecycleStore);
    const context: AuthorizationContext = {
      userId: "00000000-0000-4000-8000-000000000003",
      organizationId: "00000000-0000-4000-8000-000000000004",
      userState: "ACTIVE",
      grants: [{ permission: "document.submit", scopeType: "ORGANIZATION", scopeId: null }],
    };
    const reviewerId = "00000000-0000-4000-8000-000000000006";
    await expect(service.transition(context, {
      organizationId: context.organizationId,
      versionId: "00000000-0000-4000-8000-000000000001",
      command: "SUBMIT",
      expectedLockVersion: 0,
      reviewStages: [{ reviewerUserId: reviewerId, dueAt: new Date("2099-01-01T00:00:00Z") }],
      approverUserId: reviewerId,
    })).rejects.toThrow("The final approver must be distinct from the reviewers");
    expect(applyTransition).not.toHaveBeenCalled();
  });

  it("blocks direct approval without the electronic signature pathway", async () => {
    const store = { findVersion: vi.fn() } as unknown as DocumentLifecycleStore;
    const service = new DocumentCommandService(store);
    const context: AuthorizationContext = {
      userId: "00000000-0000-4000-8000-000000000003",
      organizationId: "00000000-0000-4000-8000-000000000004",
      userState: "ACTIVE",
      grants: [{ permission: "document.approve", scopeType: "ORGANIZATION", scopeId: null }],
    };
    await expect(service.transition(context, {
      organizationId: context.organizationId,
      versionId: "00000000-0000-4000-8000-000000000001",
      command: "APPROVE",
      expectedLockVersion: 0,
    })).rejects.toThrow();
    expect((store.findVersion as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
