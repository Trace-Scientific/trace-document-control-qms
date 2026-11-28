import { createHash } from "node:crypto";
import type { AuthorizationContext } from "../security/authorization";
import { evaluateAuthorization, requireAuthorization } from "../security/authorization";
import { PrismaQualityEventSystemIntakeStore } from "../quality/system-intake-store";

export class EquipmentComplianceValidationError extends Error {}
export type EquipmentComplianceKind="CALIBRATION_OVERDUE"|"MAINTENANCE_OVERDUE";
export type EquipmentImpactDisposition="NO_IMPACT"|"POTENTIAL_IMPACT"|"CONFIRMED_IMPACT";
export type EquipmentHoldRecord={id:string;organizationId:string;equipmentId:string;kind:EquipmentComplianceKind;dueAt:Date;detectedAt:Date;clearedAt:Date|null;clearedByUserId:string|null;clearanceReason:string|null};
export type EquipmentImpactRecord={id:string;organizationId:string;equipmentId:string;holdId:string|null;disposition:EquipmentImpactDisposition;scopeSummary:string;rationale:string;qualityEventId:string|null;assessedByUserId:string;assessedAt:Date};

export type EquipmentImpactHistoryEntry = Pick<EquipmentImpactRecord,
  "id" | "holdId" | "disposition" | "scopeSummary" | "rationale" | "assessedAt"
> & { assessorName: string; qualityEventNumber: string | null };

export interface EquipmentComplianceStore{
  listImpactHistory(organizationId: string, equipmentId: string, includeQualityEvent: boolean): Promise<EquipmentImpactHistoryEntry[]>;
  listHolds(organizationId:string,equipmentId:string):Promise<EquipmentHoldRecord[]>;
  detectOverdue():Promise<number>;
  clearHold(input:{organizationId:string;equipmentId:string;holdId:string;reason:string;actorUserId:string}):Promise<EquipmentHoldRecord>;
  createImpact(input:{organizationId:string;equipmentId:string;holdId:string|null;disposition:EquipmentImpactDisposition;scopeSummary:string;rationale:string;actorUserId:string;qualityEventId:string|null}):Promise<EquipmentImpactRecord>;
  getEquipment(organizationId:string,equipmentId:string):Promise<{equipmentNumber:string;name:string}|null>;
}

export class EquipmentComplianceService{
  constructor(private readonly store:EquipmentComplianceStore,private readonly intake=new PrismaQualityEventSystemIntakeStore()){}
  listHolds(context:AuthorizationContext,organizationId:string,equipmentId:string){requireAuthorization(context,{organizationId,permission:"equipment.read"});return this.store.listHolds(organizationId,equipmentId);}
  listImpactHistory(context: AuthorizationContext, equipmentId: string) {
    const { organizationId } = context;
    requireAuthorization(context, { organizationId, permission: "equipment.read" });
    const includeQualityEvent = evaluateAuthorization(context, { organizationId, permission: "quality_event.read" }).allowed;
    return this.store.listImpactHistory(organizationId, equipmentId, includeQualityEvent);
  }

  detectOverdue(){return this.store.detectOverdue();}
  clearHold(context:AuthorizationContext,input:{organizationId:string;equipmentId:string;holdId:string;reason:string}){requireAuthorization(context,{organizationId:input.organizationId,permission:"equipment.manage"});const reason=input.reason.trim();if(!reason||reason.length>1000)throw new EquipmentComplianceValidationError("A hold clearance reason is required");return this.store.clearHold({...input,reason,actorUserId:context.userId});}
  async assess(context:AuthorizationContext,input:{organizationId:string;equipmentId:string;holdId?:string|null;disposition:EquipmentImpactDisposition;scopeSummary:string;rationale:string}){
    requireAuthorization(context,{organizationId:input.organizationId,permission:"equipment.manage"});
    const scopeSummary=input.scopeSummary.trim(),rationale=input.rationale.trim();if(!scopeSummary||!rationale)throw new EquipmentComplianceValidationError("Impact scope and rationale are required");
    let qualityEventId:string|null=null;
    if(input.disposition!=="NO_IMPACT"){
      const equipment=await this.store.getEquipment(input.organizationId,input.equipmentId);if(!equipment)throw new EquipmentComplianceValidationError("Equipment not found");
      const sourceKey=`equipment-impact:${input.equipmentId}:${input.holdId??"manual"}:${createHash("sha256").update(`${input.disposition}|${scopeSummary}|${rationale}`).digest("hex")}`;
      const payloadHash=createHash("sha256").update(sourceKey).digest("hex");
      const result=await this.intake.ingest({organizationId:input.organizationId,sourceSystem:"EQUIPMENT",sourceKey,payloadHash,reportedByUserId:context.userId,ownerUserId:context.userId,type:"EQUIPMENT_FAILURE",severity:input.disposition==="CONFIRMED_IMPACT"?"HIGH":"MEDIUM",summary:`Equipment impact assessment: ${equipment.equipmentNumber}`,description:`${equipment.name}. Scope: ${scopeSummary}. Rationale: ${rationale}`,discoveredAt:new Date(),dueAt:null});
      qualityEventId=result.event.id;
    }
    return this.store.createImpact({organizationId:input.organizationId,equipmentId:input.equipmentId,holdId:input.holdId??null,disposition:input.disposition,scopeSummary,rationale,actorUserId:context.userId,qualityEventId});
  }
}
