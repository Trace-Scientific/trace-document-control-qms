import type { AuthorizationContext } from "../security/authorization";
import { requireAuthorization } from "../security/authorization";

export class EquipmentOperationsValidationError extends Error {}
export type EquipmentServiceOutcome="COMPLETED"|"FAILED";
export type EquipmentServiceRecord={id:string;organizationId:string;equipmentId:string;servicedAt:Date;provider:string|null;description:string;outcome:EquipmentServiceOutcome;evidenceFileId:string|null;createdByUserId:string;createdAt:Date};
export type EquipmentAnalytics={total:number;active:number;outOfService:number;retired:number;activeHolds:number;calibrationDue30:number;maintenanceDue30:number;serviceFailures90:number};
export type EquipmentWorkspaceItem={id:string;equipmentNumber:string;name:string;status:string;calibrationRequired:boolean;maintenanceRequired:boolean;nextCalibrationDueAt:Date|null;nextMaintenanceDueAt:Date|null;activeHoldCount:number;usable:boolean};

export interface EquipmentOperationsStore{
  listServiceRecords(organizationId:string,equipmentId:string):Promise<EquipmentServiceRecord[]>;
  createServiceRecord(input:{organizationId:string;equipmentId:string;servicedAt:Date;provider:string|null;description:string;outcome:EquipmentServiceOutcome;evidenceFileId:string|null;actorUserId:string}):Promise<EquipmentServiceRecord>;
  analytics(organizationId:string):Promise<EquipmentAnalytics>;
  workspace(organizationId:string):Promise<EquipmentWorkspaceItem[]>;
}

export class EquipmentOperationsService{
  constructor(private readonly store:EquipmentOperationsStore){}
  listServiceRecords(context:AuthorizationContext,organizationId:string,equipmentId:string){requireAuthorization(context,{organizationId,permission:"equipment.read"});return this.store.listServiceRecords(organizationId,equipmentId);}
  analytics(context:AuthorizationContext,organizationId:string){requireAuthorization(context,{organizationId,permission:"equipment.read"});return this.store.analytics(organizationId);}
  workspace(context:AuthorizationContext,organizationId:string){requireAuthorization(context,{organizationId,permission:"equipment.read"});return this.store.workspace(organizationId);}
  createServiceRecord(context:AuthorizationContext,input:{organizationId:string;equipmentId:string;servicedAt:Date;provider?:string|null;description:string;outcome:EquipmentServiceOutcome;evidenceFileId?:string|null}){
    requireAuthorization(context,{organizationId:input.organizationId,permission:"equipment.manage"});
    const description=input.description.trim(); if(!description||description.length>5000)throw new EquipmentOperationsValidationError("Service description is required and must not exceed 5000 characters");
    if(Number.isNaN(input.servicedAt.getTime()))throw new EquipmentOperationsValidationError("Service date is invalid");
    return this.store.createServiceRecord({...input,provider:input.provider?.trim()||null,description,evidenceFileId:input.evidenceFileId??null,actorUserId:context.userId});
  }
}
