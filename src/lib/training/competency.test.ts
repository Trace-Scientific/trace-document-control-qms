import { describe, expect, it, vi } from "vitest";
import type { AuthorizationContext } from "../security/authorization";
import { CompetencyService, CompetencyValidationError, type CompetencyStore } from "./competency";

const context = (permissions: string[]): AuthorizationContext => ({
  organizationId: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  userState: "ACTIVE",
  grants: permissions.map((permission) => ({ permission, scopeType: "ORGANIZATION" as const, scopeId: null })),
});
const store=():CompetencyStore=>({
  listPrograms:vi.fn(async()=>[]), createProgram:vi.fn(async i=>({id:"p",...i,active:true,createdAt:new Date(),updatedAt:new Date()})),
  listElements:vi.fn(async()=>[]), createElement:vi.fn(async i=>({id:"e",...i,createdAt:new Date()})),
  listAssessments:vi.fn(async()=>[]), createAssessment:vi.fn(async i=>({id:"a",organizationId:i.organizationId,employeeId:i.employeeId,programId:i.programId,assessedAt:i.assessedAt,outcome:i.outcome,expiresAt:i.expiresAt,assessorUserId:i.actorUserId,fileId:i.fileId,notes:i.notes,createdAt:new Date()})),
});

describe("CompetencyService",()=>{
  it("requires training.read for competency browsing",()=>{ const service=new CompetencyService(store()); expect(()=>service.listPrograms(context([]),"00000000-0000-0000-0000-000000000001")).toThrow("Access denied"); });
  it("requires training.manage for competency program creation",()=>{ const service=new CompetencyService(store()); expect(()=>service.createProgram(context(["training.read"]),{organizationId:"00000000-0000-0000-0000-000000000001",code:"PCR",title:"PCR competency"})).toThrow("Access denied"); });
  it("rejects invalid validity periods",()=>{ const service=new CompetencyService(store()); expect(()=>service.createProgram(context(["training.manage"]),{organizationId:"00000000-0000-0000-0000-000000000001",code:"PCR",title:"PCR competency",validityDays:0})).toThrow(CompetencyValidationError); });
  it("requires at least one assessment element result",()=>{ const service=new CompetencyService(store()); expect(()=>service.createAssessment(context(["training.manage"]),{organizationId:"00000000-0000-0000-0000-000000000001",employeeId:"00000000-0000-0000-0000-000000000003",programId:"00000000-0000-0000-0000-000000000004",assessedAt:new Date(),outcome:"QUALIFIED",elementResults:[]})).toThrow("requires element results"); });
  it("rejects duplicate element results",()=>{ const service=new CompetencyService(store()); expect(()=>service.createAssessment(context(["training.manage"]),{organizationId:"00000000-0000-0000-0000-000000000001",employeeId:"00000000-0000-0000-0000-000000000003",programId:"00000000-0000-0000-0000-000000000004",assessedAt:new Date(),outcome:"QUALIFIED",elementResults:[{elementId:"e",outcome:"PASS"},{elementId:"e",outcome:"PASS"}]})).toThrow("must be unique"); });
  it("rejects cross-tenant competency reads before accessing the store",()=>{
    const backing=store();
    const service=new CompetencyService(backing);
    const otherOrganizationId="00000000-0000-0000-0000-000000000099";
    expect(()=>service.listPrograms(context(["training.read"]),otherOrganizationId)).toThrow("Access denied");
    expect(backing.listPrograms).not.toHaveBeenCalled();
    expect(()=>service.listAssessments(context(["training.read"]),otherOrganizationId)).toThrow("Access denied");
    expect(backing.listAssessments).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant competency writes before accessing the store",()=>{
    const backing=store();
    const service=new CompetencyService(backing);
    const organizationId="00000000-0000-0000-0000-000000000099";
    expect(()=>service.createProgram(context(["training.manage"]),{organizationId,code:"PCR",title:"PCR competency"})).toThrow("Access denied");
    expect(backing.createProgram).not.toHaveBeenCalled();
    expect(()=>service.createAssessment(context(["training.manage"]),{
      organizationId,
      employeeId:"00000000-0000-0000-0000-000000000003",
      programId:"00000000-0000-0000-0000-000000000004",
      assessedAt:new Date("2026-11-19T12:00:00Z"),
      outcome:"QUALIFIED",
      elementResults:[{elementId:"e",outcome:"PASS"}],
    })).toThrow("Access denied");
    expect(backing.createAssessment).not.toHaveBeenCalled();
  });

  it("denies assessment creation with read-only competency access",()=>{
    const backing=store();
    const service=new CompetencyService(backing);
    expect(()=>service.createAssessment(context(["training.read"]),{
      organizationId:"00000000-0000-0000-0000-000000000001",
      employeeId:"00000000-0000-0000-0000-000000000003",
      programId:"00000000-0000-0000-0000-000000000004",
      assessedAt:new Date("2026-11-19T12:00:00Z"),
      outcome:"QUALIFIED",
      elementResults:[{elementId:"e",outcome:"PASS"}],
    })).toThrow("Access denied");
    expect(backing.createAssessment).not.toHaveBeenCalled();
  });

});
