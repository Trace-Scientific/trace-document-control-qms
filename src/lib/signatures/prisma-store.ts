import { db } from "../db";
import { APPROVAL_MEANING, type ApprovalPayload } from "./payload";
import type { ApprovalEvidence, ApprovalSignatureStore } from "./service";

export class PrismaApprovalSignatureStore implements ApprovalSignatureStore {
  async recentFailedReauthentications(
    organizationId: string,
    userId: string,
    since: Date,
  ) {
    return db.authenticationEvent.count({
      where: {
        organizationId,
        userId,
        eventType: "REAUTHENTICATION",
        outcome: "FAILURE",
        occurredAt: { gte: since },
        metadata: { path: ["purpose"], equals: "DOCUMENT_APPROVAL" },
      },
    });
  }

  async loadEvidence(
    organizationId: string,
    userId: string,
    versionId: string,
  ) {
    const user = await db.user.findFirst({
      where: {
        organizationId,
        id: userId,
        status: "ACTIVE",
        credential: { disabledAt: null },
      },
      select: { credential: { select: { passwordHash: true } } },
    });
    if (!user?.credential) return null;
    const version = await db.documentVersion.findFirst({
      where: { organizationId, id: versionId },
      select: {
        id: true,
        organizationId: true,
        documentId: true,
        revisionLabel: true,
        contentHash: true,
        status: true,
        lockVersion: true,
      },
    });
    if (!version) return null;
    return {
      organizationId,
      userId,
      passwordHash: user.credential.passwordHash,
      documentId: version.documentId,
      documentVersionId: version.id,
      revisionLabel: version.revisionLabel,
      contentHash: version.contentHash,
      status: version.status,
      lockVersion: version.lockVersion,
    };
  }

  async recordFailedReauthentication(
    evidence: ApprovalEvidence,
    occurredAt: Date,
  ) {
    await db.$transaction([
      db.authenticationEvent.create({
        data: {
          organizationId: evidence.organizationId,
          userId: evidence.userId,
          eventType: "REAUTHENTICATION",
          outcome: "FAILURE",
          method: "PASSWORD",
          occurredAt,
          metadata: { purpose: "DOCUMENT_APPROVAL" },
        },
      }),
      db.auditEvent.create({
        data: {
          organizationId: evidence.organizationId,
          actorUserId: evidence.userId,
          action: "DOCUMENT_APPROVAL_REAUTHENTICATION_FAILED",
          entityType: "DocumentVersion",
          entityId: evidence.documentVersionId,
          occurredAt,
          metadata: {},
        },
      }),
    ]);
  }

  async commitApproval(
    input: ApprovalPayload & {
      expectedLockVersion: number;
      payloadHash: string;
      authenticationValidUntil: Date;
    },
  ) {
    try {
      return await db.$transaction(async (transaction) => {
        const changed = await transaction.documentVersion.updateMany({
          where: {
            organizationId: input.organizationId,
            id: input.documentVersionId,
            documentId: input.documentId,
            status: "IN_REVIEW",
            lockVersion: input.expectedLockVersion,
            revisionLabel: input.revisionLabel,
            contentHash: input.contentHash,
          },
          data: { status: "APPROVED", lockVersion: { increment: 1 } },
        });
        if (changed.count !== 1) throw new SignatureConflict();

        const workflow = await transaction.workflowInstance.findFirst({
          where: {
            organizationId: input.organizationId,
            entityType: "DocumentVersion",
            entityId: input.documentVersionId,
            status: "ACTIVE",
            state: "APPROVAL",
          },
          orderBy: { startedAt: "desc" },
        });
        if (!workflow)
          throw new SignatureConfigurationError(
            "An active review workflow is required",
          );
        const eligibleTask = await transaction.workflowTask.findFirst({
          where: {
            organizationId: input.organizationId,
            workflowInstanceId: workflow.id,
            status: { in: ["PENDING", "IN_PROGRESS"] },
            stepKey: "APPROVAL",
            OR: [
              { assigneeUserId: null },
              { assigneeUserId: input.signerUserId },
            ],
          },
          orderBy: { createdAt: "asc" },
        });
        if (!eligibleTask) throw new SignatureEligibilityError();
        await transaction.workflowTask.update({
          where: { id: eligibleTask.id },
          data: {
            status: "COMPLETED",
            completedAt: input.signedAt,
            decision: "APPROVE",
          },
        });
        await transaction.workflowInstance.update({
          where: { id: workflow.id },
          data: {
            status: "COMPLETED",
            state: "APPROVED",
            completedAt: input.signedAt,
            lockVersion: { increment: 1 },
          },
        });

        const authentication = await transaction.authenticationEvent.create({
          data: {
            organizationId: input.organizationId,
            userId: input.signerUserId,
            eventType: "REAUTHENTICATION",
            outcome: "SUCCESS",
            method: "PASSWORD",
            occurredAt: input.signedAt,
            validUntil: input.authenticationValidUntil,
            metadata: { purpose: "DOCUMENT_APPROVAL" },
          },
        });
        const signature = await transaction.electronicSignature.create({
          data: {
            organizationId: input.organizationId,
            signerUserId: input.signerUserId,
            workflowInstanceId: workflow.id,
            documentVersionId: input.documentVersionId,
            entityType: "DocumentVersion",
            entityId: input.documentVersionId,
            entityVersion: input.revisionLabel,
            meaning: "APPROVED",
            meaningText: APPROVAL_MEANING,
            authenticationEventId: authentication.id,
            payloadHash: input.payloadHash,
            signedAt: input.signedAt,
          },
        });
        await transaction.auditEvent.create({
          data: {
            organizationId: input.organizationId,
            actorUserId: input.signerUserId,
            action: "DOCUMENT_VERSION_APPROVED_WITH_SIGNATURE",
            entityType: "DocumentVersion",
            entityId: input.documentVersionId,
            occurredAt: input.signedAt,
            metadata: {
              signatureId: signature.id,
              authenticationEventId: authentication.id,
              payloadHash: input.payloadHash,
              revisionLabel: input.revisionLabel,
            },
          },
        });
        return { signatureId: signature.id };
      });
    } catch (error) {
      if (error instanceof SignatureConflict) return null;
      throw error;
    }
  }
}

class SignatureConflict extends Error {}
export class SignatureConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignatureConfigurationError";
  }
}
export class SignatureEligibilityError extends Error {
  constructor() {
    super("Signer is not eligible for the active workflow task");
    this.name = "SignatureEligibilityError";
  }
}
