import { describe, expect, it } from "vitest";
import { hashAcknowledgmentPayload } from "./payload";

const input = { organizationId: "org-1", userId: "user-1", assignmentId: "assignment-1", documentId: "doc-1", documentVersionId: "version-1", revisionLabel: "1.0", contentHash: "a".repeat(64), signedAt: new Date("2026-08-24T21:00:00Z") };
describe("acknowledgment signature payload", () => {
  it("binds the recipient and exact controlled version", () => { const hash = hashAcknowledgmentPayload(input); expect(hash).toMatch(/^[a-f0-9]{64}$/); expect(hashAcknowledgmentPayload({ ...input, userId: "user-2" })).not.toBe(hash); expect(hashAcknowledgmentPayload({ ...input, contentHash: "b".repeat(64) })).not.toBe(hash); });
});
