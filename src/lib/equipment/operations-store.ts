import { Prisma } from "@prisma/client";
import { db } from "../db";
import { EquipmentOperationsValidationError,type EquipmentAnalytics,type EquipmentOperationsStore,type EquipmentServiceRecord,type EquipmentWorkspaceItem } from "./operations";

export class PrismaEquipmentOperationsStore implements EquipmentOperationsStore{
  listServiceRecords(organizationId:string,equipmentId:string){return db.$queryRaw<EquipmentServiceRecord[]>(Prisma.sql`SELECT * FROM "EquipmentServiceRecord" WHERE "organizationId"=${organizationId}::uuid AND "equipmentId"=${equipmentId}::uuid ORDER BY "servicedAt" DESC,"createdAt" DESC`);}
  async createServiceRecord(input:Parameters<EquipmentOperationsStore["createServiceRecord"]>[0]){
    return db.$transaction(async tx=>{
      const equipment=(await tx.$queryRaw<Array<{id:string;equipmentNumber:string;status:string}>>(Prisma.sql`SELECT id,"equipmentNumber",status FROM "Equipment" WHERE "organizationId"=${input.organizationId}::uuid AND id=${input.equipmentId}::uuid FOR UPDATE`))[0];
      if(!equipment)throw new EquipmentOperationsValidationError("Equipment not found"); if(equipment.status==="RETIRED")throw new EquipmentOperationsValidationError("Retired equipment cannot receive service records");
      if(input.evidenceFileId){const file=await tx.fileObject.findFirst({where:{organizationId:input.organizationId,id:input.evidenceFileId,status:"AVAILABLE"},select:{id:true}});if(!file)throw new Error("Access denied");}
      const record=(await tx.$queryRaw<EquipmentServiceRecord[]>(Prisma.sql`INSERT INTO "EquipmentServiceRecord" ("organizationId","equipmentId","servicedAt","provider","description","outcome","evidenceFileId","createdByUserId") VALUES (${input.organizationId}::uuid,${input.equipmentId}::uuid,${input.servicedAt},${input.provider},${input.description},${input.outcome}::"EquipmentServiceOutcome",${input.evidenceFileId}::uuid,${input.actorUserId}::uuid) RETURNING *`))[0];
      if(!record)throw new EquipmentOperationsValidationError("Service record could not be created");
      await tx.auditEvent.create({data:{organizationId:input.organizationId,actorUserId:input.actorUserId,action:"EQUIPMENT_SERVICE_RECORDED",entityType:"Equipment",entityId:input.equipmentId,metadata:{serviceRecordId:record.id,equipmentNumber:equipment.equipmentNumber,outcome:record.outcome,servicedAt:record.servicedAt.toISOString(),evidenceFileId:record.evidenceFileId}}});
      return record;
    });
  }
  async analytics(organizationId:string){
    const rows=await db.$queryRaw<EquipmentAnalytics[]>(Prisma.sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE e.status='ACTIVE')::int AS active,
        count(*) FILTER (WHERE e.status='OUT_OF_SERVICE')::int AS "outOfService",
        count(*) FILTER (WHERE e.status='RETIRED')::int AS retired,
        (SELECT count(*)::int FROM "EquipmentComplianceHold" h WHERE h."organizationId"=${organizationId}::uuid AND h."clearedAt" IS NULL) AS "activeHolds",
        count(*) FILTER (WHERE e.status='ACTIVE' AND e."calibrationRequired"=true AND e."nextCalibrationDueAt" BETWEEN CURRENT_DATE AND CURRENT_DATE+30)::int AS "calibrationDue30",
        count(*) FILTER (WHERE e.status='ACTIVE' AND e."maintenanceRequired"=true AND e."nextMaintenanceDueAt" BETWEEN CURRENT_DATE AND CURRENT_DATE+30)::int AS "maintenanceDue30",
        (SELECT count(*)::int FROM "EquipmentServiceRecord" s WHERE s."organizationId"=${organizationId}::uuid AND s.outcome='FAILED' AND s."servicedAt">=CURRENT_TIMESTAMP-INTERVAL '90 days') AS "serviceFailures90"
      FROM "Equipment" e WHERE e."organizationId"=${organizationId}::uuid
    `);return rows[0]??{total:0,active:0,outOfService:0,retired:0,activeHolds:0,calibrationDue30:0,maintenanceDue30:0,serviceFailures90:0};
  }
  workspace(organizationId:string){return db.$queryRaw<EquipmentWorkspaceItem[]>(Prisma.sql`
    SELECT e.id,e."equipmentNumber",e.name,e.status,e."calibrationRequired",e."maintenanceRequired",e."nextCalibrationDueAt",e."nextMaintenanceDueAt",count(DISTINCT h.id)::int AS "activeHoldCount",
      (e.status='ACTIVE' AND count(DISTINCT h.id)=0 AND count(DISTINCT r.id)=0 AND (NOT e."calibrationRequired" OR e."nextCalibrationDueAt">=CURRENT_DATE) AND (NOT e."maintenanceRequired" OR e."nextMaintenanceDueAt">=CURRENT_DATE)) AS usable
    FROM "Equipment" e
    LEFT JOIN "EquipmentComplianceHold" h ON h."organizationId"=e."organizationId" AND h."equipmentId"=e.id AND h."clearedAt" IS NULL
    LEFT JOIN "EquipmentRecall" r ON r."organizationId"=e."organizationId" AND r."equipmentId"=e.id AND r.status='OPEN'
    WHERE e."organizationId"=${organizationId}::uuid GROUP BY e.id ORDER BY e."equipmentNumber"
  `);}
}
