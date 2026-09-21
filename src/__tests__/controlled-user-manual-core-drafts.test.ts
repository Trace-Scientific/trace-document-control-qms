import { describe, expect, it } from "vitest";
import { CONTROLLED_USER_MANUAL_CORE_DRAFTS } from "@/lib/platform/controlled-user-manual-core-drafts";

describe("UM-QMS-001 verified core drafts", () => {
  it("authors only the reviewed core sections", () => {
    expect(CONTROLLED_USER_MANUAL_CORE_DRAFTS.map((section) => section.sectionCode)).toEqual(["UM-01","UM-02","UM-03","UM-04","UM-05","UM-06","UM-14"]);
  });
  it("preserves critical governance boundaries", () => {
    const text=CONTROLLED_USER_MANUAL_CORE_DRAFTS.map((section)=>section.body).join("\n");
    expect(text).toContain("does not replace your organization's SOPs");
    expect(text).toContain("A newly uploaded file is not automatically an approved or effective controlled document");
    expect(text).toContain("Submitting a support request does not grant Trace access to your tenant");
    expect(text).toContain("independent approval");
    expect(text).toContain("time-bound support session");
  });
  it("includes safe support-content instructions", () => {
    const support=CONTROLLED_USER_MANUAL_CORE_DRAFTS.find((section)=>section.sectionCode==="UM-14");
    expect(support?.body).toContain("Do not include passwords, credentials, patient information, controlled document content, or other regulated record data");
  });
});
