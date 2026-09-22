import { describe, expect, it } from "vitest";
import { CONTROLLED_USER_MANUAL } from "@/lib/platform/controlled-user-manual";
import { CONTROLLED_USER_MANUAL_DRAFTS, getControlledUserManualDraft } from "@/lib/platform/controlled-user-manual-drafts";

describe("UM-QMS-001 consistency-reviewed draft set", () => {
  it("presents one canonical ordered draft for every required section", () => {
    expect(CONTROLLED_USER_MANUAL_DRAFTS.map((section) => section.sectionCode)).toEqual(
      CONTROLLED_USER_MANUAL.sections.map(([code]) => code),
    );
    expect(new Set(CONTROLLED_USER_MANUAL_DRAFTS.map((section) => section.sectionCode)).size).toBe(16);
  });

  it("keeps titles synchronized with the controlled baseline", () => {
    for (const [code, title] of CONTROLLED_USER_MANUAL.sections) {
      expect(getControlledUserManualDraft(code)?.title).toBe(title);
    }
  });

  it("keeps every section substantive and traceable as an initial launch draft", () => {
    for (const section of CONTROLLED_USER_MANUAL_DRAFTS) {
      expect(section.changeSummary).toBe("Initial launch operating guidance.");
      expect(section.body.trim().length).toBeGreaterThan(250);
    }
  });

  it("locks cross-section release and authority boundaries", () => {
    const allText = CONTROLLED_USER_MANUAL_DRAFTS.map((section) => section.body).join("\n");
    expect(allText).toContain("Only a published manual release that has reached its effective date");
    expect(allText).toContain("does not replace your organization's SOPs");
    expect(allText).toContain("A newly uploaded file is not automatically an approved or effective controlled document");
    expect(allText).toContain("Training completion and competency qualification are related but distinct records");
    expect(allText).toContain("Submitting a support request does not grant Trace access to your tenant");
    expect(allText).toContain("It does not by itself grant permission");
  });
});
