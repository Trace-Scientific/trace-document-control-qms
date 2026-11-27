import { describe, expect, it, vi } from "vitest";
import type { AuthorizationContext } from "../security/authorization";
import { QualityCapaService, QualityCapaValidationError, type CapaRecord, type EffectivenessCheckRecord, type QualityCapaStore } from "./capa";

const organizationId="00000000-0000-0000-0000-000000000001";const userId="00000000-0000-0000-0000-000000000002";const eventId="00000000-0000-0000-0000-000000000003";const actionId="00000000-0000-0000-0000-000000000004";
const context=(permissions:string[]):AuthorizationContext=>({organizationId,userId,userState:"ACTIVE",grants:permissions.map(permission=>({permission,scopeType:"ORGANIZATION" as const,scopeId:null}))});
const action: CapaRecord={id:actionId,organizationId,eventId,actionType:"CORRECTIVE",description:"Correct process",ownerUserId:userId,dueAt:new Date("2026-09-30"),status:"OPEN",completedAt:null,completionEvidence:null,completionEvidenceFileId:null,createdByUserId:userId,createdAt:new Date()};
const completedAction: CapaRecord={...action,status:"COMPLETED",completedAt:new Date(),completionEvidence:"Implemented"};
const check: EffectivenessCheckRecord={id:"00000000-0000-0000-0000-000000000005",organizationId,eventId,capaActionId:actionId,result:"PASS",evidence:"No recurrence",evidenceFileId:null,checkedByUserId:userId,checkedAt:new Date()};
const store=():QualityCapaStore=>({listWorklist:vi.fn(async()=>[]),list:vi.fn(async()=>[]),create:vi.fn(async()=>action),complete:vi.fn(async()=>completedAction),verify:vi.fn(async()=>check)});

describe("QualityCapaService",()=>{
  it("scopes the worklist to the signed-in organization", async () => {
    const s = store();
    const service = new QualityCapaService(s);
    await expect(service.listWorklist(context(["quality_event.read"]))).resolves.toEqual([]);
    expect(s.listWorklist).toHaveBeenCalledWith(organizationId);
    const otherOrg = "00000000-0000-0000-0000-000000000009";
    await service.listWorklist({ ...context(["quality_event.read"]), organizationId: otherOrg });
    expect(s.listWorklist).toHaveBeenLastCalledWith(otherOrg);
  });

  it("rejects missing, scoped, and inactive CAPA worklist access before persistence", () => {
    const s = store();
    const service = new QualityCapaService(s);
    expect(() => service.listWorklist(context(["quality_event.manage"]))).toThrow("Access denied");
    expect(() => service.listWorklist({
      ...context([]),
      grants: [{ permission: "quality_event.read", scopeType: "SITE", scopeId: eventId }],
    })).toThrow("Access denied");
    expect(() => service.listWorklist({ ...context(["quality_event.read"]), userState: "SUSPENDED" })).toThrow("Access denied");
    expect(s.listWorklist).not.toHaveBeenCalled();
  });

  it("requires read permission for CAPA browsing",()=>{const service=new QualityCapaService(store());expect(()=>service.list(context([]),organizationId,eventId)).toThrow("Access denied");});
  it("requires manage permission for CAPA creation",()=>{const service=new QualityCapaService(store());expect(()=>service.create(context(["quality_event.read"]),{organizationId,eventId,actionType:"CORRECTIVE",description:"Action",ownerUserId:userId,dueAt:new Date()})).toThrow("Access denied");});
  it("rejects blank action descriptions",()=>{const service=new QualityCapaService(store());expect(()=>service.create(context(["quality_event.manage"]),{organizationId,eventId,actionType:"CORRECTIVE",description:"   ",ownerUserId:userId,dueAt:new Date()})).toThrow(QualityCapaValidationError);});
  it("requires completion evidence",()=>{const service=new QualityCapaService(store());expect(()=>service.complete(context(["quality_event.manage"]),{organizationId,eventId,capaActionId:actionId,completionEvidence:"  "})).toThrow(QualityCapaValidationError);});
  it("requires effectiveness evidence",()=>{const service=new QualityCapaService(store());expect(()=>service.verify(context(["quality_event.manage"]),{organizationId,eventId,capaActionId:actionId,result:"PASS",evidence:"  "})).toThrow(QualityCapaValidationError);});
  it("normalizes governed evidence before persistence",async()=>{const s=store();const service=new QualityCapaService(s);await service.complete(context(["quality_event.manage"]),{organizationId,eventId,capaActionId:actionId,completionEvidence:"  Implemented and reviewed  "});expect(s.complete).toHaveBeenCalledWith(expect.objectContaining({completionEvidence:"Implemented and reviewed",completionEvidenceFileId:null,actorUserId:userId}));});
});
