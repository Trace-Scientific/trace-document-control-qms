import { describe,expect,it,vi } from "vitest";
import type { AuthorizationContext } from "../security/authorization";
import { EquipmentComplianceService,EquipmentComplianceValidationError,type EquipmentComplianceStore,type EquipmentHoldRecord } from "./compliance";
const organizationId="00000000-0000-0000-0000-000000000001",userId="00000000-0000-0000-0000-000000000002",equipmentId="00000000-0000-0000-0000-000000000003";
const context=(permissions:string[]):AuthorizationContext=>({organizationId,userId,userState:"ACTIVE",grants:permissions.map(permission=>({permission,scopeType:"ORGANIZATION" as const,scopeId:null}))});
const store=():EquipmentComplianceStore=>({
 listImpactHistory:vi.fn(async()=>[]),
 listHolds:vi.fn(async()=>[]),
 detectOverdue:vi.fn(async()=>1),
 clearHold:vi.fn(async (input:Parameters<EquipmentComplianceStore["clearHold"]>[0]):Promise<EquipmentHoldRecord>=>({id:input.holdId,organizationId,equipmentId,kind:"CALIBRATION_OVERDUE",dueAt:new Date(),detectedAt:new Date(),clearedAt:new Date(),clearedByUserId:userId,clearanceReason:input.reason})),
 createImpact:vi.fn(async input=>({id:"00000000-0000-0000-0000-000000000004",organizationId,equipmentId,holdId:input.holdId,disposition:input.disposition,scopeSummary:input.scopeSummary,rationale:input.rationale,qualityEventId:input.qualityEventId,assessedByUserId:userId,assessedAt:new Date()})),
 getEquipment:vi.fn(async()=>({equipmentNumber:"EQ-001",name:"Analyzer"}))
});
describe("EquipmentComplianceService",()=>{
 it("requires equipment.read for holds",()=>{expect(()=>new EquipmentComplianceService(store()).listHolds(context([]),organizationId,equipmentId)).toThrow("Access denied");});
 it("requires a reason to clear a hold",()=>{expect(()=>new EquipmentComplianceService(store()).clearHold(context(["equipment.manage"]),{organizationId,equipmentId,holdId:"00000000-0000-0000-0000-000000000005",reason:" "})).toThrow(EquipmentComplianceValidationError);});
 it("records no-impact assessment without a quality event",async()=>{const s=store();const intake={ingest:vi.fn()};await new EquipmentComplianceService(s,intake as never).assess(context(["equipment.manage"]),{organizationId,equipmentId,disposition:"NO_IMPACT",scopeSummary:"No patient testing performed",rationale:"Equipment was not in use"});expect(intake.ingest).not.toHaveBeenCalled();expect(s.createImpact).toHaveBeenCalledWith(expect.objectContaining({qualityEventId:null,disposition:"NO_IMPACT"}));});
 it("creates a quality event for confirmed impact",async()=>{const s=store();const intake={ingest:vi.fn(async()=>({event:{id:"00000000-0000-0000-0000-000000000006"},created:true}))};await new EquipmentComplianceService(s,intake as never).assess(context(["equipment.manage"]),{organizationId,equipmentId,disposition:"CONFIRMED_IMPACT",scopeSummary:"Affected testing identified",rationale:"Calibration failure occurred during testing"});expect(intake.ingest).toHaveBeenCalledWith(expect.objectContaining({type:"EQUIPMENT_FAILURE",severity:"HIGH",reportedByUserId:userId}));});
});

it("requires equipment read and only includes the linked quality event for authorized readers", async () => {
 const s = store();
 const service = new EquipmentComplianceService(s);
 expect(() => service.listImpactHistory(context(["quality_event.read"]), equipmentId)).toThrow("Access denied");
 expect(s.listImpactHistory).not.toHaveBeenCalled();
 await service.listImpactHistory(context(["equipment.read"]), equipmentId);
 expect(s.listImpactHistory).toHaveBeenLastCalledWith(organizationId, equipmentId, false);
 await service.listImpactHistory(context(["equipment.read", "quality_event.read"]), equipmentId);
 expect(s.listImpactHistory).toHaveBeenLastCalledWith(organizationId, equipmentId, true);
});
