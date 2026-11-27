import { Prisma } from "@prisma/client";
import { db } from "../db";
import { QualityInvestigationValidationError,type QualityInvestigationHistoryEntry,type QualityInvestigationRecord,type QualityInvestigationStore } from "./investigations";

export class PrismaQualityInvestigationStore implements QualityInvestigationStore {
  list(organizationId: string, eventId: string) {
    return db.$queryRaw<QualityInvestigationHistoryEntry[]>(Prisma.sql`
      SELECT i.*, TRIM(CONCAT(u."firstName", ' ', u."lastName")) AS "investigatorName"
      FROM "QualityEventInvestigation" i
      JOIN "User" u ON u."organizationId" = i."organizationId" AND u."id" = i."investigatorUserId"
      WHERE i."organizationId" = ${organizationId}::uuid AND i."eventId" = ${eventId}::uuid
      ORDER BY i."sequence" DESC
    `);
  }
  async create(input:Parameters<QualityInvestigationStore["create"]>[0]){
    return db.$transaction(async tx=>{
      const events=await tx.$queryRaw<Array<{id:string;eventNumber:string;status:string}>>(Prisma.sql`SELECT "id","eventNumber","status"::text AS "status" FROM "QualityEvent" WHERE "organizationId"=${input.organizationId}::uuid AND "id"=${input.eventId}::uuid FOR UPDATE`);
      const event=events[0];
      if(!event)throw new QualityInvestigationValidationError("Quality event not found");
      if(!["INVESTIGATING","ACTION_REQUIRED","VERIFICATION"].includes(event.status))throw new QualityInvestigationValidationError("Quality event must be in an investigation-capable status");
      if(input.evidenceFileId){const file=await tx.fileObject.findFirst({where:{organizationId:input.organizationId,id:input.evidenceFileId,status:"AVAILABLE"},select:{id:true}});if(!file)throw new QualityInvestigationValidationError("Supporting evidence file must be AVAILABLE in the same tenant");}
      const sequenceRows=await tx.$queryRaw<Array<{sequence:number}>>(Prisma.sql`SELECT COALESCE(MAX("sequence"),0)+1 AS "sequence" FROM "QualityEventInvestigation" WHERE "organizationId"=${input.organizationId}::uuid AND "eventId"=${input.eventId}::uuid`);
      const sequence=sequenceRows[0]?.sequence;
      if(!sequence)throw new QualityInvestigationValidationError("Investigation sequence could not be allocated");
      const riskScore=input.riskLikelihood*input.riskImpact;
      const rows=await tx.$queryRaw<QualityInvestigationRecord[]>(Prisma.sql`INSERT INTO "QualityEventInvestigation" ("organizationId","eventId","sequence","findings","affectedScope","evidenceSummary","evidenceFileId","rootCauseMethod","rootCause","riskLikelihood","riskImpact","riskScore","investigatorUserId") VALUES (${input.organizationId}::uuid,${input.eventId}::uuid,${sequence},${input.findings},${input.affectedScope},${input.evidenceSummary},${input.evidenceFileId}::uuid,${input.rootCauseMethod}::"RootCauseMethod",${input.rootCause},${input.riskLikelihood},${input.riskImpact},${riskScore},${input.investigatorUserId}::uuid) RETURNING *`);
      const record=rows[0];if(!record)throw new QualityInvestigationValidationError("Investigation evidence could not be recorded");
      await tx.auditEvent.create({data:{organizationId:input.organizationId,actorUserId:input.investigatorUserId,action:"QUALITY_EVENT_INVESTIGATION_RECORDED",entityType:"QualityEvent",entityId:input.eventId,metadata:{eventNumber:event.eventNumber,investigationId:record.id,sequence:record.sequence,rootCauseMethod:record.rootCauseMethod,riskLikelihood:record.riskLikelihood,riskImpact:record.riskImpact,riskScore:record.riskScore,evidenceFileId:input.evidenceFileId}}});
      return record;
    });
  }
}
