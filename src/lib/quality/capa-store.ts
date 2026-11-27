import { Prisma } from "@prisma/client";
import { db } from "../db";
import { QualityCapaValidationError, type CapaEffectivenessHistoryEntry, type CapaRecord, type CapaWorkItem, type EffectivenessCheckRecord, type QualityCapaStore } from "./capa";

const allowedStatuses=new Set(["ACTION_REQUIRED","VERIFICATION"]);

async function requireAvailableEvidenceFile(tx:Prisma.TransactionClient,organizationId:string,fileId:string|null){
  if(!fileId)return;
  const file=await tx.fileObject.findFirst({where:{organizationId,id:fileId,status:"AVAILABLE"},select:{id:true}});
  if(!file)throw new QualityCapaValidationError("Supporting evidence file must be AVAILABLE in the same tenant");
}

export class PrismaQualityCapaStore implements QualityCapaStore{
  list(organizationId:string,eventId:string){return db.$queryRaw<CapaRecord[]>(Prisma.sql`SELECT * FROM "QualityCapaAction" WHERE "organizationId"=${organizationId}::uuid AND "eventId"=${eventId}::uuid ORDER BY "createdAt" ASC`);}
  listEffectivenessHistory(organizationId: string, eventId: string) {
    return db.$queryRaw<CapaEffectivenessHistoryEntry[]>(Prisma.sql`
      SELECT e."id", e."capaActionId", e."result", e."evidence", e."evidenceFileId", e."checkedAt",
             TRIM(CONCAT(u."firstName", ' ', u."lastName")) AS "checkerName"
      FROM "QualityEffectivenessCheck" e
      JOIN "QualityCapaAction" a ON a."organizationId" = e."organizationId"
        AND a."eventId" = e."eventId" AND a."id" = e."capaActionId"
      JOIN "User" u ON u."organizationId" = e."organizationId" AND u."id" = e."checkedByUserId"
      WHERE e."organizationId" = ${organizationId}::uuid AND e."eventId" = ${eventId}::uuid
      ORDER BY e."checkedAt" DESC, e."id" DESC
    `);
  }

  listWorklist(organizationId: string) {
    return db.$queryRaw<CapaWorkItem[]>(Prisma.sql`
      SELECT a."id", a."eventId", q."eventNumber", q."summary" AS "eventSummary",
             q."status" AS "eventStatus", a."description", a."ownerUserId",
             TRIM(CONCAT(u."firstName", ' ', u."lastName")) AS "ownerName",
             to_char(a."dueAt", 'YYYY-MM-DD') AS "dueAt",
             to_char(a."completedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "completedAt",
             CASE
               WHEN a."status" = 'OPEN' THEN 'OPEN'
               WHEN checks."hasFailure" THEN 'FAILED_CHECK'
               ELSE 'NEEDS_CHECK'
             END AS "stage"
      FROM "QualityCapaAction" a
      JOIN "QualityEvent" q ON q."organizationId" = a."organizationId" AND q."id" = a."eventId"
      JOIN "User" u ON u."organizationId" = a."organizationId" AND u."id" = a."ownerUserId"
      LEFT JOIN LATERAL (
        SELECT bool_or(e."result" = 'PASS') AS "hasPass",
               bool_or(e."result" = 'FAIL') AS "hasFailure"
        FROM "QualityEffectivenessCheck" e
        WHERE e."organizationId" = a."organizationId" AND e."eventId" = a."eventId"
          AND e."capaActionId" = a."id" AND a."status" = 'COMPLETED'
      ) checks ON TRUE
      WHERE a."organizationId" = ${organizationId}::uuid AND q."status" <> 'CLOSED'
        AND (a."status" = 'OPEN' OR checks."hasPass" IS NOT TRUE)
      ORDER BY CASE WHEN a."status" = 'OPEN' THEN 0 ELSE 1 END,
               CASE WHEN a."status" = 'OPEN' THEN a."dueAt" END,
               a."completedAt", a."id"
    `);
  }

  async create(input:Parameters<QualityCapaStore["create"]>[0]){
    return db.$transaction(async tx=>{
      const events=await tx.$queryRaw<Array<{status:string}>>(Prisma.sql`SELECT "status"::text AS "status" FROM "QualityEvent" WHERE "organizationId"=${input.organizationId}::uuid AND "id"=${input.eventId}::uuid FOR UPDATE`);
      const event=events[0];if(!event)throw new QualityCapaValidationError("Quality event not found");if(!allowedStatuses.has(event.status))throw new QualityCapaValidationError("CAPA actions require an ACTION_REQUIRED or VERIFICATION quality event");
      const owner=await tx.user.findFirst({where:{organizationId:input.organizationId,id:input.ownerUserId,status:"ACTIVE"},select:{id:true}});if(!owner)throw new Error("Access denied");
      const rows=await tx.$queryRaw<CapaRecord[]>(Prisma.sql`INSERT INTO "QualityCapaAction" ("organizationId","eventId","actionType","description","ownerUserId","dueAt","createdByUserId") VALUES (${input.organizationId}::uuid,${input.eventId}::uuid,${input.actionType}::"QualityCapaActionType",${input.description},${input.ownerUserId}::uuid,${input.dueAt}::date,${input.actorUserId}::uuid) RETURNING *`);
      const action=rows[0];if(!action)throw new QualityCapaValidationError("CAPA action could not be created");
      await tx.auditEvent.create({data:{organizationId:input.organizationId,actorUserId:input.actorUserId,action:"QUALITY_CAPA_ACTION_CREATED",entityType:"QualityCapaAction",entityId:action.id,metadata:{eventId:input.eventId,actionType:action.actionType,ownerUserId:action.ownerUserId,dueAt:action.dueAt.toISOString().slice(0,10)}}});return action;
    });
  }
  async complete(input:Parameters<QualityCapaStore["complete"]>[0]){
    return db.$transaction(async tx=>{
      const rows=await tx.$queryRaw<CapaRecord[]>(Prisma.sql`SELECT * FROM "QualityCapaAction" WHERE "organizationId"=${input.organizationId}::uuid AND "eventId"=${input.eventId}::uuid AND "id"=${input.capaActionId}::uuid FOR UPDATE`);
      const action=rows[0];if(!action)throw new QualityCapaValidationError("CAPA action not found");if(action.status!=="OPEN")throw new QualityCapaValidationError("Only open CAPA actions can be completed");
      await requireAvailableEvidenceFile(tx,input.organizationId,input.completionEvidenceFileId);
      const updatedRows=await tx.$queryRaw<CapaRecord[]>(Prisma.sql`UPDATE "QualityCapaAction" SET "status"='COMPLETED',"completedAt"=CURRENT_TIMESTAMP,"completionEvidence"=${input.completionEvidence},"completionEvidenceFileId"=${input.completionEvidenceFileId}::uuid WHERE "organizationId"=${input.organizationId}::uuid AND "id"=${input.capaActionId}::uuid RETURNING *`);const updated=updatedRows[0];if(!updated)throw new QualityCapaValidationError("CAPA action could not be completed");
      await tx.auditEvent.create({data:{organizationId:input.organizationId,actorUserId:input.actorUserId,action:"QUALITY_CAPA_ACTION_COMPLETED",entityType:"QualityCapaAction",entityId:updated.id,metadata:{eventId:input.eventId,completionEvidenceFileId:input.completionEvidenceFileId}}});return updated;
    });
  }
  async verify(input:Parameters<QualityCapaStore["verify"]>[0]){
    return db.$transaction(async tx=>{
      const actions=await tx.$queryRaw<CapaRecord[]>(Prisma.sql`SELECT * FROM "QualityCapaAction" WHERE "organizationId"=${input.organizationId}::uuid AND "eventId"=${input.eventId}::uuid AND "id"=${input.capaActionId}::uuid FOR UPDATE`);const action=actions[0];if(!action)throw new QualityCapaValidationError("CAPA action not found");if(action.status!=="COMPLETED")throw new QualityCapaValidationError("Effectiveness can be checked only after CAPA completion");
      await requireAvailableEvidenceFile(tx,input.organizationId,input.evidenceFileId);
      const rows=await tx.$queryRaw<EffectivenessCheckRecord[]>(Prisma.sql`INSERT INTO "QualityEffectivenessCheck" ("organizationId","eventId","capaActionId","result","evidence","evidenceFileId","checkedByUserId") VALUES (${input.organizationId}::uuid,${input.eventId}::uuid,${input.capaActionId}::uuid,${input.result}::"QualityEffectivenessResult",${input.evidence},${input.evidenceFileId}::uuid,${input.actorUserId}::uuid) RETURNING *`);const check=rows[0];if(!check)throw new QualityCapaValidationError("Effectiveness check could not be recorded");
      await tx.auditEvent.create({data:{organizationId:input.organizationId,actorUserId:input.actorUserId,action:"QUALITY_CAPA_EFFECTIVENESS_RECORDED",entityType:"QualityEffectivenessCheck",entityId:check.id,metadata:{eventId:input.eventId,capaActionId:input.capaActionId,result:input.result,evidenceFileId:input.evidenceFileId}}});return check;
    });
  }
}
