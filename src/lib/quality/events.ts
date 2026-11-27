import type { AuthorizationContext } from "../security/authorization";
import { requireAuthorization } from "../security/authorization";

export class QualityEventValidationError extends Error {}

export type QualityEventType = "NONCONFORMANCE"|"PATIENT_COMPLAINT"|"PHYSICIAN_COMPLAINT"|"SPECIMEN_PROBLEM"|"TESTING_ERROR"|"QC_FAILURE"|"PT_FAILURE"|"EQUIPMENT_FAILURE"|"REPORTING_ERROR"|"BILLING_ADMINISTRATIVE"|"SAFETY_EVENT"|"PERSONNEL_EVENT"|"DEVIATION"|"OTHER";
export type QualityEventSeverity = "LOW"|"MEDIUM"|"HIGH"|"CRITICAL";
export type QualityEventStatus = "OPEN"|"INVESTIGATING"|"ACTION_REQUIRED"|"VERIFICATION"|"CLOSED";
export type QualityEventSource = "MANUAL"|"SYSTEM";

export type QualityEventRecord = {
  id:string; organizationId:string; eventNumber:string; type:QualityEventType; severity:QualityEventSeverity; source:QualityEventSource; status:QualityEventStatus;
  summary:string; description:string|null; discoveredAt:Date; reportedByUserId:string; ownerUserId:string|null; dueAt:Date|null; createdAt:Date; updatedAt:Date;
};

export type QualityEventOwnerOption={id:string;email:string;firstName:string;lastName:string};

export type QualityEventLifecycleUpdate = {
  organizationId:string; eventId:string; reason:string; actorUserId:string;
  status?:QualityEventStatus; ownerUserId?:string|null; dueAt?:Date|null;
};

export type QualityEventLifecycleChange = {
  id: string;
  kind: "STATUS" | "OWNER" | "DUE_DATE";
  fromValue: string | null;
  toValue: string | null;
  fromOwnerName: string | null;
  toOwnerName: string | null;
  reason: string;
  actorName: string;
  createdAt: Date;
};

export interface QualityEventStore {
  listLifecycleHistory(organizationId: string, eventId: string): Promise<QualityEventLifecycleChange[]>;
  listEvents(organizationId:string, status?:QualityEventStatus):Promise<QualityEventRecord[]>;
  listAssignableOwners(organizationId:string):Promise<QualityEventOwnerOption[]>;
  createEvent(input:{organizationId:string;type:QualityEventType;severity:QualityEventSeverity;source:QualityEventSource;summary:string;description:string|null;discoveredAt:Date;ownerUserId:string|null;dueAt:Date|null;actorUserId:string}):Promise<QualityEventRecord>;
  updateLifecycle(input:QualityEventLifecycleUpdate):Promise<QualityEventRecord>;
}

export class QualityEventService {
  constructor(private readonly store:QualityEventStore) {}

  listLifecycleHistory(context: AuthorizationContext, eventId: string) {
    requireAuthorization(context, { organizationId: context.organizationId, permission: "quality_event.read" });
    return this.store.listLifecycleHistory(context.organizationId, eventId);
  }

  listEvents(context:AuthorizationContext, organizationId:string, status?:QualityEventStatus) {
    requireAuthorization(context,{organizationId,permission:"quality_event.read"});
    return this.store.listEvents(organizationId,status);
  }

  listAssignableOwners(context:AuthorizationContext, organizationId:string) {
    requireAuthorization(context,{organizationId,permission:"quality_event.manage"});
    return this.store.listAssignableOwners(organizationId);
  }

  createEvent(context:AuthorizationContext,input:{organizationId:string;type:QualityEventType;severity:QualityEventSeverity;source?:QualityEventSource;summary:string;description?:string|null;discoveredAt:Date;ownerUserId?:string|null;dueAt?:Date|null}) {
    requireAuthorization(context,{organizationId:input.organizationId,permission:"quality_event.manage"});
    const summary=input.summary.trim();
    const description=input.description?.trim()||null;
    const dueAt=input.dueAt??null;
    if(!summary || summary.length>240) throw new QualityEventValidationError("Quality event summary is required and must not exceed 240 characters");
    if((description?.length??0)>5000) throw new QualityEventValidationError("Quality event description is too long");
    if(Number.isNaN(input.discoveredAt.getTime())) throw new QualityEventValidationError("Quality event discovery time is invalid");
    if(dueAt&&Number.isNaN(dueAt.getTime())) throw new QualityEventValidationError("Quality event due date is invalid");
    return this.store.createEvent({organizationId:input.organizationId,type:input.type,severity:input.severity,source:input.source??"MANUAL",summary,description,discoveredAt:input.discoveredAt,ownerUserId:input.ownerUserId??null,dueAt,actorUserId:context.userId});
  }

  updateLifecycle(context:AuthorizationContext,input:{organizationId:string;eventId:string;reason:string;status?:QualityEventStatus;ownerUserId?:string|null;dueAt?:Date|null}) {
    requireAuthorization(context,{organizationId:input.organizationId,permission:"quality_event.manage"});
    const reason=input.reason.trim();
    if(!reason || reason.length>1000) throw new QualityEventValidationError("A lifecycle change reason is required and must not exceed 1000 characters");
    if(input.status===undefined && input.ownerUserId===undefined && input.dueAt===undefined) throw new QualityEventValidationError("At least one quality event lifecycle change is required");
    if(input.status==="CLOSED") throw new QualityEventValidationError("Quality event closure requires the controlled closure workflow");
    if(input.dueAt!==undefined && input.dueAt!==null && Number.isNaN(input.dueAt.getTime())) throw new QualityEventValidationError("Quality event due date is invalid");
    return this.store.updateLifecycle({...input,reason,actorUserId:context.userId});
  }
}
