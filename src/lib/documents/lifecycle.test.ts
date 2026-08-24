import { describe, expect, it } from "vitest";
import { nextDocumentVersionState, validateDraftRevision } from "./lifecycle";

describe("controlled document lifecycle", () => {
  it.each([
    ["DRAFT", "SUBMIT", "IN_REVIEW"],
    ["IN_REVIEW", "APPROVE", "APPROVED"],
    ["IN_REVIEW", "REJECT", "DRAFT"],
    ["APPROVED", "MAKE_EFFECTIVE", "EFFECTIVE"],
  ] as const)("moves %s through %s to %s", (current, command, expected) => {
    expect(nextDocumentVersionState(current, command, command === "REJECT" ? "Revise" : undefined)).toBe(expected);
  });

  it.each([
    ["DRAFT", "APPROVE"],
    ["DRAFT", "MAKE_EFFECTIVE"],
    ["IN_REVIEW", "MAKE_EFFECTIVE"],
    ["EFFECTIVE", "SUBMIT"],
    ["SUPERSEDED", "APPROVE"],
  ] as const)("rejects the skipped or historical transition %s/%s", (current, command) => {
    expect(() => nextDocumentVersionState(current, command)).toThrow("Invalid document transition");
  });

  it("requires a rejection reason", () => {
    expect(() => nextDocumentVersionState("IN_REVIEW", "REJECT", "  ")).toThrow("reason is required");
  });

  it("validates revision evidence", () => {
    expect(() => validateDraftRevision({
      versionNumber: 1,
      revisionLabel: "1.0",
      contentHash: "a".repeat(64),
      changeSummary: "Initial controlled version",
    })).not.toThrow();
    expect(() => validateDraftRevision({
      versionNumber: 0,
      revisionLabel: "",
      contentHash: "raw-content",
      changeSummary: "",
    })).toThrow();
  });
});
