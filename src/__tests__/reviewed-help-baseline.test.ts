import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";
import { REVIEWED_HELP_BASELINE } from "@/lib/platform/reviewed-help-baseline";

const service=readFileSync(join(process.cwd(),"src/lib/platform/reviewed-help-baseline-service.ts"),"utf8");
const panel=readFileSync(join(process.cwd(),"src/components/platform-reviewed-help-baseline-panel.tsx"),"utf8");
const route=readFileSync(join(process.cwd(),"src/app/api/platform/help/reviewed-baseline/route.ts"),"utf8");

describe("reviewed Help baseline",()=>{
  it("covers major launch workflows",()=>{
    expect(REVIEWED_HELP_BASELINE.map(a=>a.slug)).toEqual(expect.arrayContaining([
      "controlled-documents","review-queue-approvals","records-management","personnel-credentials-qualifications",
      "training-competency","quality-events","equipment-operations","governed-reporting","tenant-administration"
    ]));
  });
  it("requires platform Help management and controlled reason",()=>{
    expect(service).toContain('permission:"platform.help.manage"');
    expect(service).toContain("A reason is required");
  });
  it("keeps assembly and publication separate",()=>{
    expect(service).toContain("async assemble");
    expect(service).toContain("async publish");
    expect(service).toContain("'DRAFT'");
    expect(panel).toContain("Assembly creates or reconciles draft revisions only");
    expect(panel).toContain("Publication is a separate explicit");
  });
  it("publishes exact reviewed revisions and audits publication",()=>{
    expect(service).toContain('"publishedRevisionId"');
    expect(service).toContain('"help.article.published"');
    expect(service).toContain("reviewed-launch-baseline");
  });
  it("exposes only authenticated platform management operations",()=>{
    expect(route).toContain("authenticatePlatformRequest");
    expect(route).toContain('z.enum(["assemble","publish"])');
  });
});
