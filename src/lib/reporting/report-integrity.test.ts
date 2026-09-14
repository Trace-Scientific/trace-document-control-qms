import { createHash } from "node:crypto";
import { describe,expect,it } from "vitest";
import { sha256Json,stableJsonStringify,verifyReportResultDigest } from "./report-integrity";

describe("report result integrity",()=>{
  it("serializes object keys deterministically",()=>{
    expect(stableJsonStringify([{status:"ACTIVE",count:2}])).toBe('[{"count":2,"status":"ACTIVE"}]');
    expect(stableJsonStringify([{count:2,status:"ACTIVE"}])).toBe('[{"count":2,"status":"ACTIVE"}]');
    expect(sha256Json([{status:"ACTIVE",count:2}])).toBe(sha256Json([{count:2,status:"ACTIVE"}]));
  });

  it("verifies the legacy governed summary digest after jsonb key reordering",()=>{
    const legacyValue=[{status:"ACTIVE",count:2}];
    const legacyDigest=createHash("sha256").update(JSON.stringify(legacyValue)).digest("hex");
    const jsonbReadback=[{count:2,status:"ACTIVE"}];
    expect(verifyReportResultDigest(jsonbReadback,legacyDigest)).toBe(true);
  });

  it("rejects changed report results",()=>{
    const digest=sha256Json([{status:"ACTIVE",count:2}]);
    expect(verifyReportResultDigest([{count:3,status:"ACTIVE"}],digest)).toBe(false);
  });
});
