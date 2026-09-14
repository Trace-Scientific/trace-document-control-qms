import { Prisma } from "@prisma/client";
import { db } from "../db";
import type { AuthorizationContext } from "../security/authorization";
import { requireAuthorization } from "../security/authorization";
import { sha256Json,verifyReportResultDigest } from "./report-integrity";
import { ReportingError } from "./reporting";

type FinalizedReportRow={id:string;reportExecutionId:string;reportCode:string;reportName:string;sourceKey:string;parameters:unknown;result:unknown;resultSha256:string;rowCount:number;finalizedAt:Date};

function csvEscape(value:unknown){
  const text=value===null||value===undefined?"":String(value);
  return /[",\n\r]/.test(text)?`"${text.replaceAll('"','""')}"`:text;
}

export function renderGovernedCsv(result:unknown):string{
  if(!Array.isArray(result))throw new ReportingError("Finalized report result is not tabular");
  if(result.length===0)return "";
  if(result.some(row=>!row||typeof row!=="object"||Array.isArray(row)))throw new ReportingError("Finalized report result is not tabular");
  const rows=result as Array<Record<string,unknown>>;
  const headers=Object.keys(rows[0]);
  if(headers.length===0||rows.some(row=>Object.keys(row).some(key=>!headers.includes(key))||headers.some(key=>!(key in row))))throw new ReportingError("Finalized report result has inconsistent columns");
  return [headers.map(csvEscape).join(","),...rows.map(row=>headers.map(header=>csvEscape(row[header])).join(","))].join("\n");
}

export class FinalizedReportService{
  async finalizeExecution(context:AuthorizationContext,input:{organizationId:string;reportExecutionId:string}){
    requireAuthorization(context,{organizationId:input.organizationId,permission:"report.manage"});
    return db.$transaction(async tx=>{
      const execution=(await tx.$queryRaw<Array<{id:string;reportCode:string;reportName:string;sourceKey:string;parameters:unknown;result:unknown;resultSha256:string;rowCount:number}>>(Prisma.sql`SELECT id,"reportCode","reportName","sourceKey"::text AS "sourceKey",parameters,result,"resultSha256","rowCount" FROM "ReportExecution" WHERE "organizationId"=${input.organizationId}::uuid AND id=${input.reportExecutionId}::uuid FOR SHARE`))[0];
      if(!execution)throw new ReportingError("Report execution not found");
      if(!verifyReportResultDigest(execution.result,execution.resultSha256))throw new ReportingError("Report execution integrity verification failed");
      const finalizedDigest=sha256Json(execution.result);
      const row=(await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`INSERT INTO "FinalizedReport" ("organizationId","reportExecutionId","reportCode","reportName","sourceKey",parameters,result,"resultSha256","rowCount","finalizedByUserId") VALUES (${input.organizationId}::uuid,${execution.id}::uuid,${execution.reportCode},${execution.reportName},${execution.sourceKey}::"ReportSourceKey",${JSON.stringify(execution.parameters)}::jsonb,${JSON.stringify(execution.result)}::jsonb,${finalizedDigest},${execution.rowCount},${context.userId}::uuid) ON CONFLICT ("organizationId","reportExecutionId") DO NOTHING RETURNING id`))[0];
      if(!row)throw new ReportingError("Report execution is already finalized");
      await tx.auditEvent.create({data:{organizationId:input.organizationId,actorUserId:context.userId,action:"REPORT_FINALIZED",entityType:"FinalizedReport",entityId:row.id,metadata:{reportExecutionId:execution.id,resultSha256:finalizedDigest,rowCount:execution.rowCount}}});
      return row;
    });
  }

  async list(context:AuthorizationContext,organizationId:string){
    requireAuthorization(context,{organizationId,permission:"report.read"});
    return db.$queryRaw<FinalizedReportRow[]>(Prisma.sql`SELECT id,"reportExecutionId","reportCode","reportName","sourceKey"::text AS "sourceKey",parameters,result,"resultSha256","rowCount","finalizedAt" FROM "FinalizedReport" WHERE "organizationId"=${organizationId}::uuid ORDER BY "finalizedAt" DESC LIMIT 100`);
  }

  async exportCsv(context:AuthorizationContext,input:{organizationId:string;finalizedReportId:string}){
    requireAuthorization(context,{organizationId:input.organizationId,permission:"report.export"});
    return db.$transaction(async tx=>{
      const report=(await tx.$queryRaw<FinalizedReportRow[]>(Prisma.sql`SELECT id,"reportExecutionId","reportCode","reportName","sourceKey"::text AS "sourceKey",parameters,result,"resultSha256","rowCount","finalizedAt" FROM "FinalizedReport" WHERE "organizationId"=${input.organizationId}::uuid AND id=${input.finalizedReportId}::uuid`))[0];
      if(!report)throw new ReportingError("Finalized report not found");
      if(!verifyReportResultDigest(report.result,report.resultSha256))throw new ReportingError("Finalized report integrity verification failed");
      const csv=renderGovernedCsv(report.result);
      await tx.auditEvent.create({data:{organizationId:input.organizationId,actorUserId:context.userId,action:"REPORT_EXPORTED_CSV",entityType:"FinalizedReport",entityId:report.id,metadata:{reportExecutionId:report.reportExecutionId,resultSha256:report.resultSha256,rowCount:report.rowCount,format:"CSV"}}});
      return{filename:`${report.reportCode.toLowerCase().replace(/[^a-z0-9_-]+/g,"-")}.csv`,csv};
    });
  }
}
