import { Prisma } from "@prisma/client";
import { db } from "../db";
import { QualityEventValidationError, type QualityEventIntake, type QualityEventLifecycleChange, type QualityEventLifecycleUpdate, type QualityEventOwnerOption, type QualityEventRecord, type QualityEventRegisterEntry, type QualityEventStatus, type QualityEventStore } from "./events";

const nextStatus:Record<Exclude<QualityEventStatus,"CLOSED">,QualityEventStatus|undefined>={OPEN:"INVESTIGATING",INVESTIGATING:"ACTION_REQUIRED",ACTION_REQUIRED:"VERIFICATION",VERIFICATION:undefined};

export class PrismaQualityEventStore implements QualityEventStore {
  async getIntake(organizationId: string, eventId: string) {
    const [intake] = await db.$queryRaw<QualityEventIntake[]>(Prisma.sql`
      SELECT q."type", q."severity", q."source", q."description", q."discoveredAt", q."createdAt",
             TRIM(CONCAT(reporter."firstName", ' ', reporter."lastName")) AS "reporterName"
      FROM "QualityEvent" q
      JOIN "User" reporter ON reporter."organizationId" = q."organizationId" AND reporter."id" = q."reportedByUserId"
      WHERE q."organizationId" = ${organizationId}::uuid AND q."id" = ${eventId}::uuid
    `);
    return intake ?? null;
  }

  listLifecycleHistory(organizationId: string, eventId: string) {
    return db.$queryRaw<QualityEventLifecycleChange[]>(Prisma.sql`
      SELECT c."id", c."kind", c."fromValue", c."toValue", c."reason", c."createdAt",
        TRIM(CONCAT(actor."firstName", ' ', actor."lastName")) AS "actorName",
        NULLIF(TRIM(CONCAT(previous_owner."firstName", ' ', previous_owner."lastName")), '') AS "fromOwnerName",
        NULLIF(TRIM(CONCAT(next_owner."firstName", ' ', next_owner."lastName")), '') AS "toOwnerName"
      FROM "QualityEventChange" c
      JOIN "User" actor ON actor."organizationId" = c."organizationId" AND actor."id" = c."actorUserId"
      LEFT JOIN "User" previous_owner ON previous_owner."organizationId" = c."organizationId"
        AND c."kind" = 'OWNER' AND previous_owner."id"::text = c."fromValue"
      LEFT JOIN "User" next_owner ON next_owner."organizationId" = c."organizationId"
        AND c."kind" = 'OWNER' AND next_owner."id"::text = c."toValue"
      WHERE c."organizationId" = ${organizationId}::uuid AND c."eventId" = ${eventId}::uuid
      ORDER BY c."createdAt" DESC, c."id" DESC
    `);
  }

  listEvents(organizationId: string, status?: QualityEventStatus) {
    const statusFilter = status ? Prisma.sql`AND q."status" = ${status}::"QualityEventStatus"` : Prisma.empty;
    return db.$queryRaw<QualityEventRegisterEntry[]>(Prisma.sql`
      SELECT q.*, NULLIF(TRIM(CONCAT(owner."firstName", ' ', owner."lastName")), '') AS "ownerName"
      FROM "QualityEvent" q
      LEFT JOIN "User" owner ON owner."organizationId" = q."organizationId" AND owner."id" = q."ownerUserId"
      WHERE q."organizationId" = ${organizationId}::uuid ${statusFilter}
      ORDER BY q."createdAt" DESC
    `);
  }

  listAssignableOwners(organizationId:string) {
    return db.user.findMany({
      where:{organizationId,status:"ACTIVE"},
      orderBy:[{lastName:"asc"},{firstName:"asc"},{email:"asc"}],
      select:{id:true,email:true,firstName:true,lastName:true},
    }) as Promise<QualityEventOwnerOption[]>;
  }

  async createEvent(input:{organizationId:string;type:QualityEventRecord["type"];severity:QualityEventRecord["severity"];source:QualityEventRecord["source"];summary:string;description:string|null;discoveredAt:Date;ownerUserId:string|null;dueAt:Date|null;actorUserId:string}) {
    return db.$transaction(async tx=>{
      if(input.ownerUserId){
        const owner=await tx.user.findFirst({where:{organizationId:input.organizationId,id:input.ownerUserId,status:"ACTIVE"},select:{id:true}});
        if(!owner) throw new Error("Access denied");
      }
      await tx.$executeRaw(Prisma.sql`INSERT INTO "QualityEventCounter" ("organizationId","nextNumber") VALUES (${input.organizationId}::uuid,1) ON CONFLICT ("organizationId") DO NOTHING`);
      const counter=await tx.$queryRaw<Array<{number:number}>>(Prisma.sql`UPDATE "QualityEventCounter" SET "nextNumber"="nextNumber"+1 WHERE "organizationId"=${input.organizationId}::uuid RETURNING "nextNumber"-1 AS "number"`);
      const sequence=counter[0]?.number;
      if(!sequence) throw new QualityEventValidationError("Quality event number could not be allocated");
      const year=input.discoveredAt.getUTCFullYear();
      const eventNumber=`QE-${year}-${String(sequence).padStart(6,"0")}`;
      const rows=await tx.$queryRaw<QualityEventRecord[]>(Prisma.sql`INSERT INTO "QualityEvent" ("organizationId","eventNumber","type","severity","source","summary","description","discoveredAt","reportedByUserId","ownerUserId","dueAt") VALUES (${input.organizationId}::uuid,${eventNumber},${input.type}::"QualityEventType",${input.severity}::"QualityEventSeverity",${input.source}::"QualityEventSource",${input.summary},${input.description},${input.discoveredAt},${input.actorUserId}::uuid,${input.ownerUserId}::uuid,${input.dueAt}) RETURNING *`);
      const event=rows[0];
      if(!event) throw new QualityEventValidationError("Quality event could not be created");
      await tx.auditEvent.create({data:{organizationId:input.organizationId,actorUserId:input.actorUserId,action:"QUALITY_EVENT_CREATED",entityType:"QualityEvent",entityId:event.id,metadata:{eventNumber:event.eventNumber,type:event.type,severity:event.severity,source:event.source,status:event.status,ownerUserId:event.ownerUserId,dueAt:event.dueAt?.toISOString()??null}}});
      return event;
    });
  }

  async updateLifecycle(input:QualityEventLifecycleUpdate) {
    return db.$transaction(async tx=>{
      const rows=await tx.$queryRaw<QualityEventRecord[]>(Prisma.sql`SELECT * FROM "QualityEvent" WHERE "organizationId"=${input.organizationId}::uuid AND "id"=${input.eventId}::uuid FOR UPDATE`);
      const current=rows[0];
      if(!current) throw new QualityEventValidationError("Quality event not found");
      if(current.status==="CLOSED") throw new QualityEventValidationError("Closed quality events cannot be modified");
      if(input.status!==undefined){
        const expected=nextStatus[current.status as Exclude<QualityEventStatus,"CLOSED">];
        if(input.status!==expected) throw new QualityEventValidationError(`Invalid quality event status transition from ${current.status}`);
      }
      if(input.ownerUserId!==undefined && input.ownerUserId!==null){
        const owner=await tx.user.findFirst({where:{organizationId:input.organizationId,id:input.ownerUserId,status:"ACTIVE"},select:{id:true}});
        if(!owner) throw new Error("Access denied");
      }
      const changes:Array<{kind:"STATUS"|"OWNER"|"DUE_DATE";fromValue:string|null;toValue:string|null}>=[];
      if(input.status!==undefined && input.status!==current.status) changes.push({kind:"STATUS",fromValue:current.status,toValue:input.status});
      if(input.ownerUserId!==undefined && input.ownerUserId!==current.ownerUserId) changes.push({kind:"OWNER",fromValue:current.ownerUserId,toValue:input.ownerUserId});
      const currentDue=current.dueAt?.toISOString().slice(0,10)??null;
      const requestedDue=input.dueAt===undefined?undefined:input.dueAt?.toISOString().slice(0,10)??null;
      if(requestedDue!==undefined && requestedDue!==currentDue) changes.push({kind:"DUE_DATE",fromValue:currentDue,toValue:requestedDue});
      if(!changes.length) throw new QualityEventValidationError("Quality event lifecycle update made no changes");
      const updatedRows=await tx.$queryRaw<QualityEventRecord[]>(Prisma.sql`UPDATE "QualityEvent" SET "status"=COALESCE(${input.status??null}::"QualityEventStatus","status"), "ownerUserId"=CASE WHEN ${input.ownerUserId===undefined} THEN "ownerUserId" ELSE ${input.ownerUserId??null}::uuid END, "dueAt"=CASE WHEN ${input.dueAt===undefined} THEN "dueAt" ELSE ${input.dueAt??null}::date END, "updatedAt"=CURRENT_TIMESTAMP WHERE "organizationId"=${input.organizationId}::uuid AND "id"=${input.eventId}::uuid RETURNING *`);
      const updated=updatedRows[0];
      if(!updated) throw new QualityEventValidationError("Quality event could not be updated");
      for(const change of changes){
        await tx.$executeRaw(Prisma.sql`INSERT INTO "QualityEventChange" ("organizationId","eventId","kind","fromValue","toValue","reason","actorUserId") VALUES (${input.organizationId}::uuid,${input.eventId}::uuid,${change.kind}::"QualityEventChangeKind",${change.fromValue},${change.toValue},${input.reason},${input.actorUserId}::uuid)`);
      }
      await tx.auditEvent.create({data:{organizationId:input.organizationId,actorUserId:input.actorUserId,action:"QUALITY_EVENT_LIFECYCLE_UPDATED",entityType:"QualityEvent",entityId:input.eventId,reason:input.reason,metadata:{eventNumber:updated.eventNumber,changes}}});
      return updated;
    });
  }
}
