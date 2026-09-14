import { Prisma } from "@prisma/client";
import { db } from "../db";
import type { AuthorizationContext } from "../security/authorization";
import { requireAuthorization } from "../security/authorization";
import { sha256Json,stableJsonStringify } from "./report-integrity";

export type ReportSourceKey="QUALITY_EVENT_SUMMARY"|"EQUIPMENT_SUMMARY";
export const reportSourceKeys:readonly ReportSourceKey[]=["QUALITY_EVENT_SUMMARY","EQUIPMENT_SUMMARY"] as const;
export const reportSourceStatusValues:Record<ReportSourceKey,readonly string[]>={
  QUALITY_EVENT_SUMMARY:["OPEN","INVESTIGATING","ACTION_REQUIRED","VERIFICATION","CLOSED"],
  EQUIPMENT_SUMMARY:["PLANNED","ACTIVE","OUT_OF_SERVICE","RETIRED"],
};
export class ReportingError extends Error {}

type ReportDefinitionRow={id:string;code:string;name:string;description:string|null;sourceKey:ReportSourceKey;active:boolean;createdAt:Date};
type ReportExecutionRow={id:string;reportDefinitionId:string;reportCode:string;reportName:string;sourceKey:ReportSourceKey;parameters:unknown;result:unknown;resultSha256:string;rowCount:number;executedAt:Date};
type SavedReportViewRow={id:string;reportDefinitionId:string;name:string;parameters:unknown;createdAt:Date;updatedAt:Date};
export type GovernedReportParameters={status?:string};

export function validateReportingParameters(sourceKey:ReportSourceKey,parameters:unknown):GovernedReportParameters{
  if(parameters===undefined||parameters===null)return{};
  if(typeof parameters!=="object"||Array.isArray(parameters))throw new ReportingError("Report parameters must be an object");
  const record=parameters as Record<string,unknown>;
  const keys=Object.keys(record);
  if(keys.some(key=>key!=="status"))throw new ReportingError("Unsupported governed report filter");
  if(record.status===undefined)return{};
  if(typeof record.status!=="string"||!reportSourceStatusValues[sourceKey].includes(record.status))throw new ReportingError("Invalid status filter for report source");
  return{status:record.status};
}

async function executeSource(tx:Prisma.TransactionClient,organizationId:string,sourceKey:ReportSourceKey,parameters:GovernedReportParameters){
  if(sourceKey==="QUALITY_EVENT_SUMMARY"){
    const statusFilter=parameters.status?Prisma.sql`AND status::text=${parameters.status}`:Prisma.empty;
    return tx.$queryRaw<Array<{status:string;count:number}>>(Prisma.sql`
      SELECT status::text AS status,count(*)::int AS count FROM "QualityEvent"
      WHERE "organizationId"=${organizationId}::uuid ${statusFilter} GROUP BY status ORDER BY status`);
  }
  if(sourceKey==="EQUIPMENT_SUMMARY"){
    const statusFilter=parameters.status?Prisma.sql`AND status::text=${parameters.status}`:Prisma.empty;
    return tx.$queryRaw<Array<{status:string;count:number}>>(Prisma.sql`
      SELECT status::text AS status,count(*)::int AS count FROM "Equipment"
      WHERE "organizationId"=${organizationId}::uuid ${statusFilter} GROUP BY status ORDER BY status`);
  }
  throw new ReportingError("Unsupported governed report source");
}

export class ReportingService{
  async listDefinitions(context:AuthorizationContext,organizationId:string){
    requireAuthorization(context,{organizationId,permission:"report.read"});
    return db.$queryRaw<ReportDefinitionRow[]>(Prisma.sql`SELECT id,code,name,description,"sourceKey",active,"createdAt" FROM "ReportDefinition" WHERE "organizationId"=${organizationId}::uuid ORDER BY code`);
  }

  async createDefinition(context:AuthorizationContext,input:{organizationId:string;code:string;name:string;description?:string|null;sourceKey:ReportSourceKey}){
    requireAuthorization(context,{organizationId:input.organizationId,permission:"report.manage"});
    const code=input.code.trim().toUpperCase(),name=input.name.trim(),description=input.description?.trim()||null;
    if(!code||!name)throw new ReportingError("Report code and name are required");
    if(!reportSourceKeys.includes(input.sourceKey))throw new ReportingError("Unsupported governed report source");
    return db.$transaction(async tx=>{
      const row=(await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`INSERT INTO "ReportDefinition" ("organizationId",code,name,description,"sourceKey","createdByUserId") VALUES (${input.organizationId}::uuid,${code},${name},${description},${input.sourceKey}::"ReportSourceKey",${context.userId}::uuid) RETURNING id`))[0];
      if(!row)throw new ReportingError("Report definition could not be created");
      await tx.auditEvent.create({data:{organizationId:input.organizationId,actorUserId:context.userId,action:"REPORT_DEFINITION_CREATED",entityType:"ReportDefinition",entityId:row.id,metadata:{code,sourceKey:input.sourceKey}}});
      return row;
    });
  }

  async listSavedViews(context:AuthorizationContext,organizationId:string,reportDefinitionId:string){
    requireAuthorization(context,{organizationId,permission:"report.read"});
    return db.$queryRaw<SavedReportViewRow[]>(Prisma.sql`SELECT id,"reportDefinitionId",name,parameters,"createdAt","updatedAt" FROM "SavedReportView" WHERE "organizationId"=${organizationId}::uuid AND "ownerUserId"=${context.userId}::uuid AND "reportDefinitionId"=${reportDefinitionId}::uuid ORDER BY name`);
  }

  async saveView(context:AuthorizationContext,input:{organizationId:string;reportDefinitionId:string;name:string;parameters?:unknown}){
    requireAuthorization(context,{organizationId:input.organizationId,permission:"report.read"});
    const name=input.name.trim(); if(!name)throw new ReportingError("Saved view name is required");
    return db.$transaction(async tx=>{
      const definition=(await tx.$queryRaw<ReportDefinitionRow[]>(Prisma.sql`SELECT id,code,name,description,"sourceKey",active,"createdAt" FROM "ReportDefinition" WHERE "organizationId"=${input.organizationId}::uuid AND id=${input.reportDefinitionId}::uuid FOR SHARE`))[0];
      if(!definition||!definition.active)throw new ReportingError("Active report definition not found");
      const parameters=validateReportingParameters(definition.sourceKey,input.parameters);
      const row=(await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`INSERT INTO "SavedReportView" ("organizationId","reportDefinitionId","ownerUserId",name,parameters) VALUES (${input.organizationId}::uuid,${definition.id}::uuid,${context.userId}::uuid,${name},${JSON.stringify(parameters)}::jsonb) ON CONFLICT ("organizationId","ownerUserId","reportDefinitionId",name) DO UPDATE SET parameters=EXCLUDED.parameters,"updatedAt"=CURRENT_TIMESTAMP RETURNING id`))[0];
      if(!row)throw new ReportingError("Saved report view could not be stored");
      await tx.auditEvent.create({data:{organizationId:input.organizationId,actorUserId:context.userId,action:"REPORT_VIEW_SAVED",entityType:"SavedReportView",entityId:row.id,metadata:{reportDefinitionId:definition.id,name,parameters}}});
      return row;
    });
  }

  async deleteSavedView(context:AuthorizationContext,input:{organizationId:string;savedViewId:string}){
    requireAuthorization(context,{organizationId:input.organizationId,permission:"report.read"});
    return db.$transaction(async tx=>{
      const row=(await tx.$queryRaw<Array<{id:string;reportDefinitionId:string;name:string}>>(Prisma.sql`DELETE FROM "SavedReportView" WHERE "organizationId"=${input.organizationId}::uuid AND id=${input.savedViewId}::uuid AND "ownerUserId"=${context.userId}::uuid RETURNING id,"reportDefinitionId",name`))[0];
      if(!row)throw new ReportingError("Saved report view not found");
      await tx.auditEvent.create({data:{organizationId:input.organizationId,actorUserId:context.userId,action:"REPORT_VIEW_DELETED",entityType:"SavedReportView",entityId:row.id,metadata:{reportDefinitionId:row.reportDefinitionId,name:row.name}}});
      return{id:row.id};
    });
  }

  async execute(context:AuthorizationContext,input:{organizationId:string;reportDefinitionId:string;parameters?:unknown;savedViewId?:string|null}){
    requireAuthorization(context,{organizationId:input.organizationId,permission:"report.read"});
    if(input.savedViewId&&input.parameters!==undefined)throw new ReportingError("Use either savedViewId or parameters, not both");
    return db.$transaction(async tx=>{
      const definition=(await tx.$queryRaw<ReportDefinitionRow[]>(Prisma.sql`SELECT id,code,name,description,"sourceKey",active,"createdAt" FROM "ReportDefinition" WHERE "organizationId"=${input.organizationId}::uuid AND id=${input.reportDefinitionId}::uuid FOR SHARE`))[0];
      if(!definition||!definition.active)throw new ReportingError("Active report definition not found");
      let rawParameters=input.parameters;
      if(input.savedViewId){
        const view=(await tx.$queryRaw<Array<{parameters:unknown}>>(Prisma.sql`SELECT parameters FROM "SavedReportView" WHERE "organizationId"=${input.organizationId}::uuid AND id=${input.savedViewId}::uuid AND "ownerUserId"=${context.userId}::uuid AND "reportDefinitionId"=${definition.id}::uuid`))[0];
        if(!view)throw new ReportingError("Saved report view not found");
        rawParameters=view.parameters;
      }
      const parameters=validateReportingParameters(definition.sourceKey,rawParameters);
      const result=await executeSource(tx,input.organizationId,definition.sourceKey,parameters);
      const canonical=stableJsonStringify(result);
      const resultSha256=sha256Json(result);
      const execution=(await tx.$queryRaw<Array<{id:string;executedAt:Date}>>(Prisma.sql`INSERT INTO "ReportExecution" ("organizationId","reportDefinitionId","reportCode","reportName","sourceKey",parameters,result,"resultSha256","rowCount","executedByUserId") VALUES (${input.organizationId}::uuid,${definition.id}::uuid,${definition.code},${definition.name},${definition.sourceKey}::"ReportSourceKey",${JSON.stringify(parameters)}::jsonb,${canonical}::jsonb,${resultSha256},${result.length},${context.userId}::uuid) RETURNING id,"executedAt"`))[0];
      if(!execution)throw new ReportingError("Report execution could not be recorded");
      await tx.auditEvent.create({data:{organizationId:input.organizationId,actorUserId:context.userId,action:"REPORT_EXECUTED",entityType:"ReportExecution",entityId:execution.id,metadata:{reportDefinitionId:definition.id,reportCode:definition.code,sourceKey:definition.sourceKey,rowCount:result.length,resultSha256,savedViewId:input.savedViewId??null}}});
      return{executionId:execution.id,executedAt:execution.executedAt,report:{code:definition.code,name:definition.name,sourceKey:definition.sourceKey},parameters,result,rowCount:result.length,resultSha256};
    });
  }

  async listExecutions(context:AuthorizationContext,organizationId:string,reportDefinitionId:string){
    requireAuthorization(context,{organizationId,permission:"report.read"});
    return db.$queryRaw<ReportExecutionRow[]>(Prisma.sql`SELECT id,"reportDefinitionId","reportCode","reportName","sourceKey",parameters,result,"resultSha256","rowCount","executedAt" FROM "ReportExecution" WHERE "organizationId"=${organizationId}::uuid AND "reportDefinitionId"=${reportDefinitionId}::uuid ORDER BY "executedAt" DESC LIMIT 100`);
  }
}
