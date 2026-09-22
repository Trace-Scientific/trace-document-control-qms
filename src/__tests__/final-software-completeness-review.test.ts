import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

const review=readFileSync(join(process.cwd(),"docs/validation/final-software-completeness-review.md"),"utf8");
const pkg=JSON.parse(readFileSync(join(process.cwd(),"package.json"),"utf8"));

describe("final software completeness review",()=>{
  it("does not misrepresent implementation completeness as validation approval",()=>{
    expect(review).toContain("not yet validated, qualified, or approved for regulated production use");
    expect(review).toContain("does not claim certification, regulatory compliance, validation approval");
  });

  it("preserves rc.7 as historical while rc.8 is the active candidate",()=>{
    expect(pkg.version).toBe("0.1.0-rc.8");
    expect(review).toContain("83c4eaa110e3313f942dcd0f326b018fe53b6c89");
    expect(review).toContain("rc.7 must remain historical");
    expect(review).toContain("designate a new release candidate");
  });

  it("preserves the AWS PLAN-only and explicit cost gate",()=>{
    expect(review).toContain("AWS remains **PLAN-only**");
    expect(review).toContain("AWS costs begin here");
    expect(review).toContain("obtain explicit approval before APPLY");
  });

  it("preserves manual and Help publication boundaries",()=>{
    expect(review).toContain("UM-QMS-001");
    expect(review).toContain("DRAFT, unscheduled, and unpublished");
    expect(review).toContain("Help content is not automatically published");
  });

  it("keeps Railway evidence separate from validation qualification",()=>{
    expect(review).toContain("synthetic-data development preview");
    expect(review).toContain("Railway deployment or UI review is not AWS validation qualification");
  });
});
