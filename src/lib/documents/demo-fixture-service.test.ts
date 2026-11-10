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
});
