import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

const review=readFileSync(join(process.cwd(),"docs/validation/final-railway-smoke-readiness.md"),"utf8");

describe("final Railway smoke readiness review",()=>{
  it("records successful runtime deployment for current main",()=>{
    expect(review).toContain("trace-document-control-qms");
    expect(review).toContain("salesforce-cdc-worker");
    expect(review).toContain("all migrations successfully applied");
  });

  it("does not overstate visual UI evidence",()=>{
    expect(review).toContain("authenticated visual/UI inspection is **manual confirmation pending**");
    expect(review).toContain("not equivalent to a complete authenticated visual UI inspection");
  });

  it("keeps Railway separate from validation qualification",()=>{
    expect(review).toContain("synthetic-data development preview");
    expect(review).toContain("not AWS validation qualification");
  });

  it("keeps the release-candidate and AWS gates fail-closed",()=>{
    expect(review).toContain("Do not designate the next immutable release candidate until");
    expect(review).toContain("AWS remains **PLAN-only**");
    expect(review).toContain("No AWS APPLY is authorized");
  });
});
