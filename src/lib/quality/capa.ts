import type { QualityEventStatus } from "./events";
import type { AuthorizationContext } from "../security/authorization";
import { requireAuthorization } from "../security/authorization";

export class QualityCapaValidationError extends Error {}
export type CapaActionType="CORRECTIVE"|"PREVENTIVE";
export type CapaActionStatus="OPEN"|"COMPLETED";
export type EffectivenessResult="PASS"|"FAIL";
export type CapaRecord={id:string;organizationId:string;eventId:string;actionType:CapaActionType;description:string;ownerUserId:string;dueAt:Date;status:CapaActionStatus;completedAt:Date|null;completionEvidence:string|null;completionEvidenceFileId:string|null;createdByUserId:string;createdAt:Date};
export type EffectivenessCheckRecord={id:string;organizationId:string;eventId:string;capaActionId:string;result:EffectivenessResult;evidence:string;evidenceFileId:string|null;checkedByUserId:string;checkedAt:Date};

export type CapaEffectivenessHistoryEntry = Pick<EffectivenessCheckRecord,
  "id" | "capaActionId" | "result" | "evidence" | "evidenceFileId" | "checkedAt"
> & { checkerName: string };

export type CapaWorkItem = {
  id: string;
  eventId: string;
  eventNumber: string;
  eventSummary: string;
  eventStatus: QualityEventStatus;
  description: string;
  ownerUserId: string;
  ownerName: string;
  dueAt: string;
  completedAt: string | null;
  stage: "OPEN" | "NEEDS_CHECK" | "FAILED_CHECK";
};

export interface QualityCapaStore{
  listEffectivenessHistory(organizationId: string, eventId: string): Promise<CapaEffectivenessHistoryEntry[]>;
  listWorklist(organizationId: string): Promise<CapaWorkItem[]>;
  list(organizationId:string,eventId:string):Promise<CapaRecord[]>;
  create(input:{organizationId:string;eventId:string;actionType:CapaActionType;description:string;ownerUserId:string;dueAt:Date;actorUserId:string}):Promise<CapaRecord>;
  complete(input:{organizationId:string;eventId:string;capaActionId:string;completionEvidence:string;completionEvidenceFileId:string|null;actorUserId:string}):Promise<CapaRecord>;
  verify(input:{organizationId:string;eventId:string;capaActionId:string;result:EffectivenessResult;evidence:string;evidenceFileId:string|null;actorUserId:string}):Promise<EffectivenessCheckRecord>;
}

export class QualityCapaService{
  constructor(private readonly store:QualityCapaStore){}
  listWorklist(context: AuthorizationContext) {
    requireAuthorization(context, { organizationId: context.organizationId, permission: "quality_event.read" });
    return this.store.listWorklist(context.organizationId);
  }

  listEffectivenessHistory(context: AuthorizationContext, eventId: string) {
    requireAuthorization(context, { organizationId: context.organizationId, permission: "quality_event.read" });
    return this.store.listEffectivenessHistory(context.organizationId, eventId);
  }

  list(context:AuthorizationContext,organizationId:string,eventId:string){requireAuthorization(context,{organizationId,permission:"quality_event.read"});return this.store.list(organizationId,eventId);}
  create(context:AuthorizationContext,input:{organizationId:string;eventId:string;actionType:CapaActionType;description:string;ownerUserId:string;dueAt:Date}){
    requireAuthorization(context,{organizationId:input.organizationId,permission:"quality_event.manage"});
    const description=input.description.trim();
    if(!description||description.length>5000)throw new QualityCapaValidationError("CAPA action description is required and must not exceed 5000 characters");
    if(!input.ownerUserId)throw new QualityCapaValidationError("CAPA action owner is required");
    if(Number.isNaN(input.dueAt.getTime()))throw new QualityCapaValidationError("CAPA action due date is invalid");
    return this.store.create({...input,description,actorUserId:context.userId});
  }
  complete(context:AuthorizationContext,input:{organizationId:string;eventId:string;capaActionId:string;completionEvidence:string;completionEvidenceFileId?:string|null}){
    requireAuthorization(context,{organizationId:input.organizationId,permission:"quality_event.manage"});
    const completionEvidence=input.completionEvidence.trim();
    if(!completionEvidence||completionEvidence.length>5000)throw new QualityCapaValidationError("CAPA completion evidence is required and must not exceed 5000 characters");
    return this.store.complete({...input,completionEvidence,completionEvidenceFileId:input.completionEvidenceFileId||null,actorUserId:context.userId});
  }
  verify(context:AuthorizationContext,input:{organizationId:string;eventId:string;capaActionId:string;result:EffectivenessResult;evidence:string;evidenceFileId?:string|null}){
    requireAuthorization(context,{organizationId:input.organizationId,permission:"quality_event.manage"});
    const evidence=input.evidence.trim();
    if(!evidence||evidence.length>5000)throw new QualityCapaValidationError("Effectiveness evidence is required and must not exceed 5000 characters");
    return this.store.verify({...input,evidence,evidenceFileId:input.evidenceFileId||null,actorUserId:context.userId});
  }
}
