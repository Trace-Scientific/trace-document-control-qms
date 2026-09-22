import { REVIEWED_HELP_BASELINE } from "@/lib/platform/reviewed-help-baseline";
import { describe,expect,it } from "vitest";

describe("reviewed Help launch content coverage",()=>{
  it("includes the required launch content families",()=>{
    const categories=new Set(REVIEWED_HELP_BASELINE.map(item=>item.categoryCode));
    expect(categories).toContain("GETTING_STARTED");
    expect(categories).toContain("FAQ");
    expect(categories).toContain("TROUBLESHOOTING");
    expect(categories).toContain("GLOSSARY");
    expect(categories).toContain("RELEASE_NOTES");
    expect(categories).toContain("ADMIN");
    expect(categories).toContain("WORKFLOWS");
  });

  it("includes role-oriented getting-started guidance",()=>{
    const slugs=REVIEWED_HELP_BASELINE.map(item=>item.slug);
    expect(slugs).toContain("getting-started-general-user");
    expect(slugs).toContain("getting-started-reviewer-approver");
    expect(slugs).toContain("getting-started-quality-laboratory");
    expect(slugs).toContain("getting-started-tenant-administrator");
  });

  it("includes FAQ troubleshooting glossary and release-note guidance",()=>{
    const slugs=REVIEWED_HELP_BASELINE.map(item=>item.slug);
    expect(slugs).toContain("faq-access-workflows");
    expect(slugs).toContain("troubleshooting-common-workflow-blockers");
    expect(slugs).toContain("qms-terminology-glossary");
    expect(slugs).toContain("release-notes-how-to-read");
  });

  it("keeps user guidance within governed-access boundaries",()=>{
    const text=REVIEWED_HELP_BASELINE.map(item=>item.body).join("\n");
    expect(text).toContain("Help explains functions already available to you and never adds QMS permissions");
    expect(text).toContain("Never approve for another person");
    expect(text).toContain("do not include passwords, secrets, patient information, or controlled record content");
    expect(text).toContain("tenant permissions, configured workflows, training, validation status, and local procedures still apply");
  });
});
