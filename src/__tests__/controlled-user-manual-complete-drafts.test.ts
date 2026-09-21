import { describe, expect, it } from "vitest";
import { CONTROLLED_USER_MANUAL } from "@/lib/platform/controlled-user-manual";
import { CONTROLLED_USER_MANUAL_CORE_DRAFTS } from "@/lib/platform/controlled-user-manual-core-drafts";
import { CONTROLLED_USER_MANUAL_REMAINING_DRAFTS } from "@/lib/platform/controlled-user-manual-remaining-drafts";

describe("UM-QMS-001 complete launch draft set", () => {
  it("covers every launch-baseline section exactly once", () => {
    const expected = CONTROLLED_USER_MANUAL.sections.map(([code]) => code);
    const actual = [...CONTROLLED_USER_MANUAL_CORE_DRAFTS, ...CONTROLLED_USER_MANUAL_REMAINING_DRAFTS].map((section) => section.sectionCode);
    expect(new Set(actual).size).toBe(actual.length);
    expect([...actual].sort()).toEqual([...expected].sort());
  });

  it("preserves evidence and lifecycle boundaries", () => {
    const text = CONTROLLED_USER_MANUAL_REMAINING_DRAFTS.map((section) => section.body).join("\n");
    expect(text).toContain("Renewals should be recorded as new credential entries");
    expect(text).toContain("Training completion and competency qualification are related but distinct records");
    expect(text).toContain("A newly uploaded evidence file enters a pending scan state");
    expect(text).toContain("Uploading a file does not automatically attach it to a record");
    expect(text).toContain("A notification does not by itself grant permission");
  });

  it("preserves controlled-support separation in the glossary", () => {
    const glossary = CONTROLLED_USER_MANUAL_REMAINING_DRAFTS.find((section) => section.sectionCode === "UM-A");
    expect(glossary?.body).toContain("The case itself still does not grant tenant access");
    expect(glossary?.body).toContain("separately approved, scoped, time-bound privileged support session");
  });
});
