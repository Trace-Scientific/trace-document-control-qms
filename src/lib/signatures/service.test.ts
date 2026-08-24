import { describe, expect, it } from "vitest";
import { hashPassword } from "../security/crypto";
import type { AuthorizationContext } from "../security/authorization";
import { ApprovalSignatureService, type ApprovalEvidence, type ApprovalSignatureStore } from "./service";

const context: AuthorizationContext = { userId: "user-1", organizationId: "org-1", userState: "ACTIVE", grants: [{ permission: "document.approve", scopeType: "ORGANIZATION", scopeId: null }] };
const evidence: ApprovalEvidence = { organizationId: "org-1", userId: "user-1", passwordHash: hashPassword("correct horse battery staple"), documentId: "doc-1", documentVersionId: "version-1", revisionLabel: "2.0", contentHash: "a".repeat(64), status: "IN_REVIEW", lockVersion: 4 };

function fixture(overrides: Partial<ApprovalEvidence> = {}, commit = true, recentFailures = 0) {
  const failures: Date[] = []; const commits: unknown[] = [];
  const store: ApprovalSignatureStore = {
    async loadEvidence(org, user, version) { return org === "org-1" && user === "user-1" && version === "version-1" ? { ...evidence, ...overrides } : null; },
    async recentFailedReauthentications() { return recentFailures; },
    async recordFailedReauthentication(_evidence, at) { failures.push(at); },
    async commitApproval(input) { commits.push(input); return commit ? { signatureId: "signature-1" } : null; },
  };
  return { store, failures, commits };
}

describe("electronic approval service", () => {
  it("reauthenticates and binds the exact version to the signature", async () => {
    const f = fixture(); const service = new ApprovalSignatureService(f.store, () => new Date("2026-08-24T20:00:00Z"));
    await expect(service.signApproval(context, { organizationId: "org-1", versionId: "version-1", expectedLockVersion: 4, password: "correct horse battery staple", confirmed: true })).resolves.toMatchObject({ signatureId: "signature-1", status: "APPROVED" });
    expect(f.commits[0]).toMatchObject({ documentVersionId: "version-1", revisionLabel: "2.0", contentHash: "a".repeat(64), expectedLockVersion: 4 });
  });
  it("records failure and never commits when the password is wrong", async () => {
    const f = fixture(); const service = new ApprovalSignatureService(f.store);
    await expect(service.signApproval(context, { organizationId: "org-1", versionId: "version-1", expectedLockVersion: 4, password: "wrong password", confirmed: true })).rejects.toThrow("Reauthentication failed");
    expect(f.failures).toHaveLength(1); expect(f.commits).toHaveLength(0);
  });
  it("denies cross-tenant signing before loading evidence", async () => {
    const f = fixture(); const service = new ApprovalSignatureService(f.store);
    await expect(service.signApproval(context, { organizationId: "org-2", versionId: "version-1", expectedLockVersion: 4, password: "correct horse battery staple", confirmed: true })).rejects.toThrow("Access denied");
  });
  it("rejects stale versions and missing confirmation", async () => {
    const f = fixture(); const service = new ApprovalSignatureService(f.store);
    await expect(service.signApproval(context, { organizationId: "org-1", versionId: "version-1", expectedLockVersion: 3, password: "correct horse battery staple", confirmed: true })).rejects.toThrow("changed");
    await expect(service.signApproval(context, { organizationId: "org-1", versionId: "version-1", expectedLockVersion: 4, password: "correct horse battery staple", confirmed: false })).rejects.toThrow("confirmed");
  });
  it("throttles repeated password attempts", async () => {
    const f = fixture({}, true, 5); const service = new ApprovalSignatureService(f.store);
    await expect(service.signApproval(context, { organizationId: "org-1", versionId: "version-1", expectedLockVersion: 4, password: "wrong password", confirmed: true })).rejects.toThrow("Too many");
    expect(f.commits).toHaveLength(0);
  });
});
