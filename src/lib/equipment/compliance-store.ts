import { Prisma } from "@prisma/client";
import { db } from "../db";
import { EquipmentComplianceValidationError,type EquipmentComplianceStore,type EquipmentHoldRecord,type EquipmentImpactHistoryEntry,type EquipmentImpactRecord } from "./compliance";

export class PrismaEquipmentComplianceStore implements EquipmentComplianceStore{
  listHolds(organizationId:string,equipmentId:string){return db.$queryRaw<EquipmentHoldRecord[]>(Prisma.sql`SELECT * FROM "EquipmentComplianceHold" WHERE "organizationId"=${organizationId}::uuid AND "equipmentId"=${equipmentId}::uuid ORDER BY "detectedAt" DESC`);}
  listImpactHistory(organizationId: string, equipmentId: string, includeQualityEvent: boolean) {
    return db.$queryRaw<EquipmentImpactHistoryEntry[]>(Prisma.sql`
      SELECT a."id", a."holdId", a."disposition", a."scopeSummary", a."rationale", a."assessedAt",
             TRIM(CONCAT(u."firstName", ' ', u."lastName")) AS "assessorName",
             q."eventNumber" AS "qualityEventNumber"
      FROM "EquipmentImpactAssessment" a
      JOIN "User" u ON u."organizationId" = a."organizationId" AND u."id" = a."assessedByUserId"
      LEFT JOIN "QualityEvent" q ON ${includeQualityEvent} AND q."organizationId" = a."organizationId"
        AND q."id" = a."qualityEventId"
      WHERE a."organizationId" = ${organizationId}::uuid AND a."equipmentId" = ${equipmentId}::uuid
      ORDER BY a."assessedAt" DESC, a."id" DESC
    `);
  }

  async detectOverdue(){
    return db.$transaction(async tx=>{
      const rows=await tx.$queryRaw<Array<{organizationId:string;equipmentId:string;equipmentNumber:string;kind:string;dueAt:Date}>>(Prisma.sql`
        SELECT "organizationId",id AS "equipmentId","equipmentNumber",'CALIBRATION_OVERDUE' AS kind,"nextCalibrationDueAt" AS "dueAt" FROM "Equipment" WHERE status='ACTIVE' AND "calibrationRequired"=true AND "nextCalibrationDueAt"<CURRENT_DATE
        UNION ALL
        SELECT "organizationId",id AS "equipmentId","equipmentNumber",'MAINTENANCE_OVERDUE' AS kind,"nextMaintenanceDueAt" AS "dueAt" FROM "Equipment" WHERE status='ACTIVE' AND "maintenanceRequired"=true AND "nextMaintenanceDueAt"<CURRENT_DATE
      `);
      let created=0;
      for(const row of rows){
        const inserted=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`INSERT INTO "EquipmentComplianceHold" ("organizationId","equipmentId","kind","dueAt") VALUES (${row.organizationId}::uuid,${row.equipmentId}::uuid,${row.kind}::"EquipmentComplianceKind",${row.dueAt}) ON CONFLICT ("organizationId","equipmentId","kind","dueAt") DO NOTHING RETURNING id`);
        if(!inserted[0])continue; created++;
        const recipients=await tx.$queryRaw<Array<{userId:string}>>(Prisma.sql`
          SELECT DISTINCT ur."userId" FROM "UserRole" ur
          JOIN "User" u ON u."organizationId"=ur."organizationId" AND u.id=ur."userId" AND u.status='ACTIVE'
          JOIN "RolePermission" rp ON rp."roleId"=ur."roleId"
          JOIN "Permission" p ON p.id=rp."permissionId" AND p.key='equipment.manage'
          WHERE ur."organizationId"=${row.organizationId}::uuid
        `);
        if(recipients.length)await tx.notificationOutbox.createMany({data:recipients.map(({userId})=>({organizationId:row.organizationId,recipientUserId:userId,eventKey:`equipment-hold:${inserted[0].id}`,templateKey:"equipment-compliance-hold",payload:{equipmentId:row.equipmentId,equipmentNumber:row.equipmentNumber,kind:row.kind,dueAt:row.dueAt.toISOString().slice(0,10)}})),skipDuplicates:true});
      }
      return created;
    });
  }
  async clearHold(input:Parameters<EquipmentComplianceStore["clearHold"]>[0]){
    return db.$transaction(async tx=>{
      const hold=(await tx.$queryRaw<EquipmentHoldRecord[]>(Prisma.sql`SELECT * FROM "EquipmentComplianceHold" WHERE "organizationId"=${input.organizationId}::uuid AND "equipmentId"=${input.equipmentId}::uuid AND "id"=${input.holdId}::uuid FOR UPDATE`))[0];
      if(!hold)throw new EquipmentComplianceValidationError("Compliance hold not found");if(hold.clearedAt)throw new EquipmentComplianceValidationError("Compliance hold is already cleared");
      const equipment=(await tx.$queryRaw<Array<{nextCalibrationDueAt:Date|null;nextMaintenanceDueAt:Date|null}>>(Prisma.sql`SELECT "nextCalibrationDueAt","nextMaintenanceDueAt" FROM "Equipment" WHERE "organizationId"=${input.organizationId}::uuid AND id=${input.equipmentId}::uuid`))[0];
      const currentDue=hold.kind==="CALIBRATION_OVERDUE"?equipment?.nextCalibrationDueAt:equipment?.nextMaintenanceDueAt;if(!currentDue||currentDue<=hold.dueAt)throw new EquipmentComplianceValidationError("Current compliance evidence does not support clearing this hold");
      const updated=(await tx.$queryRaw<EquipmentHoldRecord[]>(Prisma.sql`UPDATE "EquipmentComplianceHold" SET "clearedAt"=CURRENT_TIMESTAMP,"clearedByUserId"=${input.actorUserId}::uuid,"clearanceReason"=${input.reason} WHERE id=${input.holdId}::uuid RETURNING *`))[0];
      if(!updated)throw new EquipmentComplianceValidationError("Compliance hold could not be cleared");
      await tx.auditEvent.create({data:{organizationId:input.organizationId,actorUserId:input.actorUserId,action:"EQUIPMENT_COMPLIANCE_HOLD_CLEARED",entityType:"Equipment",entityId:input.equipmentId,reason:input.reason,metadata:{holdId:input.holdId,kind:hold.kind,dueAt:hold.dueAt.toISOString()}}});return updated;
    });
  }
  async createImpact(input:Parameters<EquipmentComplianceStore["createImpact"]>[0]){
    return db.$transaction(async tx=>{
      const equipment=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM "Equipment" WHERE "organizationId"=${input.organizationId}::uuid AND id=${input.equipmentId}::uuid`);if(!equipment[0])throw new EquipmentComplianceValidationError("Equipment not found");
      if(input.holdId){const hold=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT id FROM "EquipmentComplianceHold" WHERE "organizationId"=${input.organizationId}::uuid AND "equipmentId"=${input.equipmentId}::uuid AND id=${input.holdId}::uuid`);if(!hold[0])throw new EquipmentComplianceValidationError("Compliance hold not found");}
      const record=(await tx.$queryRaw<EquipmentImpactRecord[]>(Prisma.sql`INSERT INTO "EquipmentImpactAssessment" ("organizationId","equipmentId","holdId","disposition","scopeSummary","rationale","qualityEventId","assessedByUserId") VALUES (${input.organizationId}::uuid,${input.equipmentId}::uuid,${input.holdId}::uuid,${input.disposition}::"EquipmentImpactDisposition",${input.scopeSummary},${input.rationale},${input.qualityEventId}::uuid,${input.actorUserId}::uuid) RETURNING *`))[0];if(!record)throw new EquipmentComplianceValidationError("Impact assessment could not be recorded");
      await tx.auditEvent.create({data:{organizationId:input.organizationId,actorUserId:input.actorUserId,action:"EQUIPMENT_IMPACT_ASSESSED",entityType:"Equipment",entityId:input.equipmentId,metadata:{assessmentId:record.id,holdId:record.holdId,disposition:record.disposition,qualityEventId:record.qualityEventId}}});return record;
    });
  }
  async getEquipment(organizationId:string,equipmentId:string){return (await db.$queryRaw<Array<{equipmentNumber:string;name:string}>>(Prisma.sql`SELECT "equipmentNumber",name FROM "Equipment" WHERE "organizationId"=${organizationId}::uuid AND id=${equipmentId}::uuid`))[0]??null;}
}
