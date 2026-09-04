import { describe, expect, it } from "vitest";
import type { AuthorizationContext } from "../security/authorization";
import { DocumentFileAttachmentService, type AttachableFile, type AttachableVersion, type DocumentFileAttachmentStore } from "./file-attachment";

const context: AuthorizationContext = {
  userId: "user-1", organizationId: "org-1", userState: "ACTIVE",
  grants: [{ permission: "document.create", scopeType: "ORGANIZATION", scopeId: null }],
};
const draft: AttachableVersion = { id: "version-1", organizationId: "org-1", status: "DRAFT", lockVersion: 2, fileId: null };
const available: AttachableFile = { id: "file-1", organizationId: "org-1", status: "AVAILABLE", sha256: "a".repeat(64), originalName: "controlled.txt" };

function fixture(version: AttachableVersion | null = draft, file: AttachableFile | null = available, succeeds = true) {
  const attachments: Parameters<DocumentFileAttachmentStore["attach"]>[0][] = [];
  const store: DocumentFileAttachmentStore = {
    async findVersion(org, id) { return version?.organizationId === org && version.id === id ? version : null; },
    async findFile(org, id) { return file?.organizationId === org && file.id === id ? file : null; },
    async attach(input) { attachments.push(input); return succeeds; },
  };
  return { store, attachments };
}

describe("controlled document file attachment", () => {
  it("attaches an available tenant file to a current draft with audit inputs", async () => {
    const f = fixture();
    const service = new DocumentFileAttachmentService(f.store, () => new Date("2026-09-04T19:00:00Z"));
    await expect(service.attach(context, { organizationId: "org-1", versionId: "version-1", fileId: "file-1", expectedLockVersion: 2 }))
      .resolves.toMatchObject({ status: "ATTACHED", lockVersion: 3, sha256: "a".repeat(64) });
    expect(f.attachments[0]).toMatchObject({ actorUserId: "user-1", sha256: "a".repeat(64), originalName: "controlled.txt" });
  });

  it("rejects files that have not passed scanning", async () => {
    const service = new DocumentFileAttachmentService(fixture(draft, { ...available, status: "PENDING_SCAN" }).store);
    await expect(service.attach(context, { organizationId: "org-1", versionId: "version-1", fileId: "file-1", expectedLockVersion: 2 }))
      .rejects.toThrow("Only available files can be attached");
  });

  it("rejects attachment after the revision leaves draft", async () => {
    const service = new DocumentFileAttachmentService(fixture({ ...draft, status: "EFFECTIVE" }).store);
    await expect(service.attach(context, { organizationId: "org-1", versionId: "version-1", fileId: "file-1", expectedLockVersion: 2 }))
      .rejects.toThrow("only be attached to draft");
  });

  it("rejects a second controlled file and stale lock versions", async () => {
    await expect(new DocumentFileAttachmentService(fixture({ ...draft, fileId: "existing" }).store).attach(context, { organizationId: "org-1", versionId: "version-1", fileId: "file-1", expectedLockVersion: 2 }))
      .rejects.toThrow("already has a controlled file");
    await expect(new DocumentFileAttachmentService(fixture().store).attach(context, { organizationId: "org-1", versionId: "version-1", fileId: "file-1", expectedLockVersion: 1 }))
      .rejects.toThrow("changed");
  });

  it("denies cross-tenant and missing-permission access", async () => {
    const service = new DocumentFileAttachmentService(fixture().store);
    await expect(service.attach(context, { organizationId: "org-2", versionId: "version-1", fileId: "file-1", expectedLockVersion: 2 })).rejects.toThrow("Access denied");
    await expect(service.attach({ ...context, grants: [] }, { organizationId: "org-1", versionId: "version-1", fileId: "file-1", expectedLockVersion: 2 })).rejects.toThrow("Access denied");
  });

  it("fails closed when the atomic store detects a concurrent change", async () => {
    const service = new DocumentFileAttachmentService(fixture(draft, available, false).store);
    await expect(service.attach(context, { organizationId: "org-1", versionId: "version-1", fileId: "file-1", expectedLockVersion: 2 })).rejects.toThrow("changed");
  });
});
