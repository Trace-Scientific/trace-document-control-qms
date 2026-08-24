import { describe, expect, it } from "vitest";
import { canonicalApprovalPayload, hashApprovalPayload } from "./payload";

const evidence = {
  organizationId: "org-1", signerUserId: "user-1", documentId: "doc-1",
  documentVersionId: "version-1", revisionLabel: "2.0", contentHash: "a".repeat(64),
  signedAt: new Date("2026-08-24T20:00:00.000Z"),
};

describe("electronic signature payload", () => {
  it("is deterministic and contains the exact regulated evidence", () => {
    expect(canonicalApprovalPayload(evidence)).toContain('"schema":"trace-qms-signature-v1"');
    expect(hashApprovalPayload(evidence)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashApprovalPayload(evidence)).toBe(hashApprovalPayload({ ...evidence }));
  });

  it("changes when any signed evidence changes", () => {
    const original = hashApprovalPayload(evidence);
    expect(hashApprovalPayload({ ...evidence, contentHash: "b".repeat(64) })).not.toBe(original);
    expect(hashApprovalPayload({ ...evidence, signerUserId: "user-2" })).not.toBe(original);
    expect(hashApprovalPayload({ ...evidence, revisionLabel: "2.1" })).not.toBe(original);
  });
});
