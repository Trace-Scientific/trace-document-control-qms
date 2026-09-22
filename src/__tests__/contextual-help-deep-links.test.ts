import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

const center=readFileSync(join(process.cwd(),"src/components/help-center.tsx"),"utf8");
const recs=readFileSync(join(process.cwd(),"src/lib/help/help-recommendations.ts"),"utf8");
const baseline=readFileSync(join(process.cwd(),"src/lib/platform/reviewed-help-baseline.ts"),"utf8");
const content=readFileSync(join(process.cwd(),"src/lib/platform/help-content.ts"),"utf8");
const shell=readFileSync(join(process.cwd(),"src/components/qms-module-shell.tsx"),"utf8");

const mappings=[
  ["documents","controlled-documents"],
  ["review-queue","review-queue-approvals"],
  ["administration","tenant-administration"],
  ["records","records-management"],
  ["personnel","personnel-credentials-qualifications"],
  ["training","training-competency"],
  ["quality","quality-events"],
  ["laboratory","equipment-operations"],
  ["reporting","governed-reporting"],
] as const;

describe("contextual help deep links",()=>{
  it("maps every major supported workspace to a reviewed launch article",()=>{
    for(const [context,slug] of mappings){
      expect(center).toContain(`articleSlug: "${slug}"`);
      expect(recs).toContain(`articleSlug:"${slug}"`);
      expect(baseline).toContain(`slug:"${slug}"`);
    }
  });

  it("opens direct contextual articles and recommendation cards",()=>{
    expect(center).toContain('params.get("article")');
    expect(center).toContain("context?.articleSlug");
    expect(center).toContain("openArticle(directArticle)");
    expect(center).toContain("openArticle(item.articleSlug)");
  });

  it("retains published-only article enforcement",()=>{
    expect(content).toContain('ha."status" = \'PUBLISHED\'');
    expect(content).toContain('ha."slug" = ${slug} AND ha."status" = \'PUBLISHED\'');
  });

  it("keeps a persistent workspace-aware Help entry in the QMS shell",()=>{
    expect(shell).toContain('/help?context=');
    expect(shell).toContain("Open Help Center for");
  });

  it("does not derive help access from article visibility",()=>{
    expect(recs).toContain("permissions.has(permission)");
    expect(center).toContain("Help does not grant additional access");
  });
});
