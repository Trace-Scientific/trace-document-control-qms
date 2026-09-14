import { describe,expect,it } from "vitest";
import type { AuthorizationContext } from "../security/authorization";
import { FinalizedReportService,renderGovernedCsv } from "./finalized-reports";

const organizationId="00000000-0000-0000-0000-000000000001";
const userId="00000000-0000-0000-0000-000000000002";
const context=(permissions:string[]):AuthorizationContext=>({organizationId,userId,userState:"ACTIVE",grants:permissions.map(permission=>({permission,scopeType:"ORGANIZATION" as const,scopeId:null}))});

describe("finalized governed reports",()=>{
  it("renders stable CSV from flat governed rows",()=>{
    expect(renderGovernedCsv([{status:"OPEN",count:2},{status:"CLOSED",count:1}])).toBe("status,count\nOPEN,2\nCLOSED,1");
  });

  it("keeps governed summary columns stable after jsonb key reordering",()=>{
    expect(renderGovernedCsv([{count:2,status:"ACTIVE"}])).toBe("status,count\nACTIVE,2");
  });

  it("escapes CSV fields",()=>{
    expect(renderGovernedCsv([{status:'A,"B"',count:1}])).toBe('status,count\n"A,""B""",1');
  });

  it("requires report.manage before finalization database access",async()=>{
    await expect(new FinalizedReportService().finalizeExecution(context([]),{organizationId,reportExecutionId:"00000000-0000-0000-0000-000000000003"})).rejects.toThrow("Access denied");
  });

  it("requires report.export before CSV export database access",async()=>{
    await expect(new FinalizedReportService().exportCsv(context([]),{organizationId,finalizedReportId:"00000000-0000-0000-0000-000000000004"})).rejects.toThrow("Access denied");
  });
});
