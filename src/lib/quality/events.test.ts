import { describe, expect, it, vi } from "vitest";
import type { AuthorizationContext } from "../security/authorization";
import { QualityEventService, QualityEventValidationError, type QualityEventRecord, type QualityEventStore } from "./events";

const organizationId="00000000-0000-0000-0000-000000000001";
const userId="00000000-0000-0000-0000-000000000002";
const context=(permissions:string[]):AuthorizationContext=>({organizationId,userId,userState:"ACTIVE",grants:permissions.map(permission=>({permission,scopeType:"ORGANIZATION" as const,scopeId:null}))});
const event=(status:QualityEventRecord["status"]="OPEN"):QualityEventRecord=>({id:"00000000-0000-0000-0000-000000000003",organizationId,eventNumber:"QE-2026-000001",type:"NONCONFORMANCE",severity:"MEDIUM",source:"MANUAL",status,summary:"Example",description:null,discoveredAt:new Date(),reportedByUserId:userId,ownerUserId:null,dueAt:null,createdAt:new Date(),updatedAt:new Date()});
const store=():QualityEventStore=>({
  listLifecycleHistory:vi.fn(async()=>[]),
  listEvents:vi.fn(async()=>[]),
  listAssignableOwners:vi.fn(async()=>[]),
  createEvent:vi.fn(async (input: Parameters<QualityEventStore["createEvent"]>[0]): Promise<QualityEventRecord>=>({...event(),organizationId:input.organizationId,type:input.type,severity:input.severity,source:input.source,summary:input.summary,description:input.description,discoveredAt:input.discoveredAt,reportedByUserId:input.actorUserId,ownerUserId:input.ownerUserId,dueAt:input.dueAt})),
  updateLifecycle:vi.fn(async()=>event("INVESTIGATING")),
});

describe("QualityEventService",()=>{
  it("scopes lifecycle history to the signed-in tenant and requires read permission", async () => {
    const eventId = event().id;
    const s = store();
    const service = new QualityEventService(s);
    expect(() => service.listLifecycleHistory(context([]), eventId)).toThrow("Access denied");
    expect(s.listLifecycleHistory).not.toHaveBeenCalled();
    await expect(service.listLifecycleHistory(context(["quality_event.read"]), eventId)).resolves.toEqual([]);
    expect(s.listLifecycleHistory).toHaveBeenCalledWith(organizationId, eventId);
  });
  it("requires quality_event.read for browsing",()=>{const service=new QualityEventService(store());expect(()=>service.listEvents(context([]),organizationId)).toThrow("Access denied");});
  it("requires quality_event.manage for creation",()=>{const service=new QualityEventService(store());expect(()=>service.createEvent(context(["quality_event.read"]),{organizationId,type:"NONCONFORMANCE",severity:"MEDIUM",summary:"Example",discoveredAt:new Date()})).toThrow("Access denied");});
  it("rejects blank summaries",()=>{const service=new QualityEventService(store());expect(()=>service.createEvent(context(["quality_event.manage"]),{organizationId,type:"NONCONFORMANCE",severity:"MEDIUM",summary:"   ",discoveredAt:new Date()})).toThrow(QualityEventValidationError);});
  it("creates a normalized manual event",async()=>{const s=store();const service=new QualityEventService(s);await service.createEvent(context(["quality_event.manage"]),{organizationId,type:"QC_FAILURE",severity:"HIGH",summary:"  Failed control  ",description:"  Investigation required  ",discoveredAt:new Date("2026-09-08T01:00:00Z")});expect(s.createEvent).toHaveBeenCalledWith(expect.objectContaining({summary:"Failed control",description:"Investigation required",source:"MANUAL",actorUserId:userId}));});
  it("requires quality_event.manage for lifecycle changes",()=>{const service=new QualityEventService(store());expect(()=>service.updateLifecycle(context(["quality_event.read"]),{organizationId,eventId:event().id,reason:"Begin investigation",status:"INVESTIGATING"})).toThrow("Access denied");});
  it("requires a controlled lifecycle reason",()=>{const service=new QualityEventService(store());expect(()=>service.updateLifecycle(context(["quality_event.manage"]),{organizationId,eventId:event().id,reason:"   ",status:"INVESTIGATING"})).toThrow(QualityEventValidationError);});
  it("blocks direct closure before the controlled closure slice",()=>{const service=new QualityEventService(store());expect(()=>service.updateLifecycle(context(["quality_event.manage"]),{organizationId,eventId:event().id,reason:"Close",status:"CLOSED"})).toThrow("controlled closure workflow");});
  it("passes normalized lifecycle evidence to persistence",async()=>{const s=store();const service=new QualityEventService(s);await service.updateLifecycle(context(["quality_event.manage"]),{organizationId,eventId:event().id,reason:"  Begin investigation  ",status:"INVESTIGATING"});expect(s.updateLifecycle).toHaveBeenCalledWith(expect.objectContaining({reason:"Begin investigation",actorUserId:userId,status:"INVESTIGATING"}));});
});
