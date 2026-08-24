import { db } from "../db";
import { ACKNOWLEDGMENT_MEANING, type AcknowledgmentPayload } from "./payload";
import type { AcknowledgmentStore, AssignmentEvidence } from "./service";

export class PrismaAcknowledgmentStore implements AcknowledgmentStore {
  async listOutstanding(organizationId: string, now: Date) {
    const rows=await db.acknowledgmentAssignment.findMany({where:{organizationId,status:"ASSIGNED"},select:{id:true,documentVersionId:true,assignedToUserId:true,dueAt:true},orderBy:{dueAt:"asc"}});
    return rows.map(row=>({assignmentId:row.id,documentVersionId:row.documentVersionId,recipientUserId:row.assignedToUserId,dueAt:row.dueAt,overdue:Boolean(row.dueAt&&row.dueAt<now)}));
  }
  async assign(input: { organizationId: string; versionId: string; recipientUserIds: string[]; assignedByUserId: string; dueAt: Date; assignedAt: Date }) {
    return db.$transaction(async tx => {
      const version = await tx.documentVersion.findFirst({ where: { organizationId: input.organizationId, id: input.versionId, status: "EFFECTIVE" }, select: { id: true, documentId: true } });
      if (!version) throw new DistributionValidationError("Only an effective version can be distributed");
      const active = await tx.user.count({ where: { organizationId: input.organizationId, id: { in: input.recipientUserIds }, status: "ACTIVE" } });
      if (active !== input.recipientUserIds.length) throw new DistributionValidationError("Every recipient must be an active tenant user");
      try {
        await tx.acknowledgmentAssignment.createMany({ data: input.recipientUserIds.map(userId => ({ organizationId: input.organizationId, documentId: version.documentId, documentVersionId: version.id, assignedToUserId: userId, assignedByUserId: input.assignedByUserId, assignedAt: input.assignedAt, dueAt: input.dueAt })) });
      } catch { throw new DistributionValidationError("A recipient is already assigned this version"); }
      await tx.auditEvent.create({ data: { organizationId: input.organizationId, actorUserId: input.assignedByUserId, action: "DOCUMENT_ACKNOWLEDGMENTS_ASSIGNED", entityType: "DocumentVersion", entityId: version.id, occurredAt: input.assignedAt, metadata: { recipientUserIds: input.recipientUserIds, dueAt: input.dueAt.toISOString() } } });
      return { created: input.recipientUserIds.length };
    });
  }
  async loadAssignment(organizationId: string, assignmentId: string, userId: string): Promise<AssignmentEvidence | null> {
    const row = await db.acknowledgmentAssignment.findFirst({ where: { organizationId, id: assignmentId, assignedToUserId: userId }, include: { recipient: { select: { status: true, credential: { select: { passwordHash: true, disabledAt: true } } } }, documentVersion: { select: { status: true, revisionLabel: true, contentHash: true } } } });
    if (!row?.recipient.credential || row.recipient.credential.disabledAt) return null;
    return { organizationId, userId, assignmentId: row.id, documentId: row.documentId, documentVersionId: row.documentVersionId, revisionLabel: row.documentVersion.revisionLabel, contentHash: row.documentVersion.contentHash, passwordHash: row.recipient.credential.passwordHash, assignmentStatus: row.status, documentStatus: row.documentVersion.status, recipientStatus: row.recipient.status };
  }
  async recentFailures(organizationId: string, userId: string, since: Date) { return db.authenticationEvent.count({ where: { organizationId, userId, eventType: "REAUTHENTICATION", outcome: "FAILURE", occurredAt: { gte: since }, metadata: { path: ["purpose"], equals: "DOCUMENT_ACKNOWLEDGMENT" } } }); }
  async recordFailure(e: AssignmentEvidence, at: Date) { await db.$transaction([db.authenticationEvent.create({ data: { organizationId:e.organizationId,userId:e.userId,eventType:"REAUTHENTICATION",outcome:"FAILURE",method:"PASSWORD",occurredAt:at,metadata:{purpose:"DOCUMENT_ACKNOWLEDGMENT"} } }),db.auditEvent.create({data:{organizationId:e.organizationId,actorUserId:e.userId,action:"DOCUMENT_ACKNOWLEDGMENT_REAUTHENTICATION_FAILED",entityType:"AcknowledgmentAssignment",entityId:e.assignmentId,occurredAt:at,metadata:{}}})]); }
  async complete(input: AcknowledgmentPayload & { payloadHash: string; authenticationValidUntil: Date }) {
    try { return await db.$transaction(async tx => {
      const changed=await tx.acknowledgmentAssignment.updateMany({where:{organizationId:input.organizationId,id:input.assignmentId,assignedToUserId:input.userId,documentId:input.documentId,documentVersionId:input.documentVersionId,status:"ASSIGNED",documentVersion:{status:"EFFECTIVE",revisionLabel:input.revisionLabel,contentHash:input.contentHash}},data:{status:"COMPLETED"}}); if(changed.count!==1) throw new CompletionConflict();
      const auth=await tx.authenticationEvent.create({data:{organizationId:input.organizationId,userId:input.userId,eventType:"REAUTHENTICATION",outcome:"SUCCESS",method:"PASSWORD",occurredAt:input.signedAt,validUntil:input.authenticationValidUntil,metadata:{purpose:"DOCUMENT_ACKNOWLEDGMENT"}}});
      const signature=await tx.electronicSignature.create({data:{organizationId:input.organizationId,signerUserId:input.userId,documentVersionId:input.documentVersionId,entityType:"DocumentVersion",entityId:input.documentVersionId,entityVersion:input.revisionLabel,meaning:"ACKNOWLEDGED",meaningText:ACKNOWLEDGMENT_MEANING,authenticationEventId:auth.id,payloadHash:input.payloadHash,signedAt:input.signedAt}});
      const completion=await tx.acknowledgmentCompletion.create({data:{organizationId:input.organizationId,assignmentId:input.assignmentId,signatureId:signature.id,completedAt:input.signedAt}});
      await tx.auditEvent.create({data:{organizationId:input.organizationId,actorUserId:input.userId,action:"DOCUMENT_VERSION_ACKNOWLEDGED",entityType:"AcknowledgmentAssignment",entityId:input.assignmentId,occurredAt:input.signedAt,metadata:{documentVersionId:input.documentVersionId,signatureId:signature.id,payloadHash:input.payloadHash}}}); return {completionId:completion.id};
    }); } catch(error){if(error instanceof CompletionConflict)return null;throw error;}
  }
}
class CompletionConflict extends Error {}
export class DistributionValidationError extends Error {}
