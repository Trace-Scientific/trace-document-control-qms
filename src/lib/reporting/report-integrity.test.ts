import { createHash } from "node:crypto";
import { describe,expect,it } from "vitest";
import { sha256Json,stableJsonStringify,verifyReportResultDigest } from "./report-integrity";

describe("report result integrity",()=>{
  it("serializes object keys deterministically",()=>{
    expect(stableJsonStringify([{status:"ACTIVE",count:2}])).toBe('[{"count":2,"status":"ACTIVE"}]');
    expect(stableJsonStringify([{count:2,status:"ACTIVE"}])).toBe('[{"count":2,"status":"ACTIVE"}]');
    expect(sha256Json([{status:"ACTIVE",count:2}])).toBe(sha256Json([{count:2,status:"ACTIVE"}]));
  });

  it("verifies a legacy status-count digest after jsonb key reordering",()=>{
    const legacyDigest=createHash("sha256").update(JSON.stringify([{status:"ACTIVE",count:2}])).digest("hex");
    expect(verifyReportResultDigest([{count:2,status:"ACTIVE"}],legacyDigest)).toBe(true);
  });

  it("verifies a legacy count-status digest after jsonb key reordering",()=>{
    const legacyDigest=createHash("sha256").update(JSON.stringify([{count:2,status:"ACTIVE"}])).digest("hex");
    expect(verifyReportResultDigest([{status:"ACTIVE",count:2}],legacyDigest)).toBe(true);
  });

  it("rejects changed report results",()=>{
    const digest=sha256Json([{status:"ACTIVE",count:2}]);
    expect(verifyReportResultDigest([{count:3,status:"ACTIVE"}],digest)).toBe(false);
  });
});
