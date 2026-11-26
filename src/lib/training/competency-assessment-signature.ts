import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { verifyPassword } from "../security/crypto";
import { ReauthenticationFailedError, ReauthenticationThrottledError } from "../signatures/service";
import { COMPETENCY_SIGNATURE_MEANING, type CompetencyAssessmentRecord, type CompetencyElementResultInput } from "./competency";
import type { CompetencySignatureProof } from "./competency";

const purpose = "COMPETENCY_ASSESSMENT";
const authenticationWindow = 5 * 60 * 1000;

export async function reauthenticateCompetencySigner(organizationId: string, userId: string, password: string) {
  const proof = await db.$transaction(async (tx) => {
    const [credential] = await tx.$queryRaw<{ id: string; version: number; passwordHash: string }[]>`
      SELECT c."id", c."version", c."passwordHash" FROM "Credential" c
      JOIN "User" u ON (u."organizationId", u."id") = (c."organizationId", c."userId")
      WHERE c."organizationId" = ${organizationId}::uuid AND c."userId" = ${userId}::uuid
        AND c."disabledAt" IS NULL AND u."status" = 'ACTIVE' FOR UPDATE OF c
    `;
    if (!credential) return null;
    const occurredAt = new Date();
    const failures = await tx.authenticationEvent.count({
      where: { organizationId, userId, eventType: "REAUTHENTICATION", outcome: "FAILURE",
        occurredAt: { gte: new Date(occurredAt.getTime() - 15 * 60 * 1000) },
        metadata: { path: ["purpose"], equals: purpose } },
    });
    if (failures >= 5) throw new ReauthenticationThrottledError();
    if (!verifyPassword(password, credential.passwordHash)) {
      await tx.authenticationEvent.create({ data: {
        organizationId, userId, eventType: "REAUTHENTICATION", outcome: "FAILURE", method: "PASSWORD",
        occurredAt, metadata: { purpose },
      } });
      return null;
    }
    return { credentialId: credential.id, credentialVersion: credential.version, authenticatedAt: occurredAt };
  });
  if (!proof) throw new ReauthenticationFailedError();
  return proof;
}

export async function recordCompetencySignature(
  tx: Prisma.TransactionClient,
  assessment: CompetencyAssessmentRecord,
  elementResults: CompetencyElementResultInput[],
  proof: CompetencySignatureProof,
  fileSha256: string | null,
  evaluatorAuthorizationId: string | null,
) {
  const { organizationId, assessorUserId } = assessment;
  const [current] = await tx.$queryRaw<{ id: string }[]>`
    SELECT c."id" FROM "Credential" c
    JOIN "User" u ON (u."organizationId", u."id") = (c."organizationId", c."userId")
    WHERE c."organizationId" = ${organizationId}::uuid AND c."userId" = ${assessorUserId}::uuid
      AND c."id" = ${proof.credentialId}::uuid AND c."version" = ${proof.credentialVersion}
      AND c."disabledAt" IS NULL AND u."status" = 'ACTIVE' FOR SHARE OF c, u
  `;
  const signedAt = new Date();
  const validUntil = new Date(proof.authenticatedAt.getTime() + authenticationWindow);
  if (!current || signedAt < proof.authenticatedAt || signedAt > validUntil) throw new ReauthenticationFailedError();

  const authentication = await tx.authenticationEvent.create({ data: {
    organizationId, userId: assessorUserId, eventType: "REAUTHENTICATION", outcome: "SUCCESS", method: "PASSWORD",
    occurredAt: proof.authenticatedAt, validUntil, metadata: { purpose },
  } });
  const payloadHash = hashCompetencySignature(assessment, elementResults, fileSha256, evaluatorAuthorizationId, signedAt);
  return tx.electronicSignature.create({ data: {
    organizationId, signerUserId: assessorUserId, entityType: "CompetencyAssessment", entityId: assessment.id,
    entityVersion: "1", meaning: "VERIFIED", meaningText: COMPETENCY_SIGNATURE_MEANING, signedAt,
    authenticationEventId: authentication.id, payloadHash,
  }, select: { id: true, authenticationEventId: true, payloadHash: true } });
}

export function hashCompetencySignature(
  assessment: CompetencyAssessmentRecord,
  elementResults: CompetencyElementResultInput[],
  fileSha256: string | null,
  evaluatorAuthorizationId: string | null,
  signedAt: Date,
) {
  const payload = JSON.stringify({
    schema: "trace-qms-competency-signature-v1",
    meaning: "VERIFIED",
    meaningText: COMPETENCY_SIGNATURE_MEANING,
    assessmentId: assessment.id,
    organizationId: assessment.organizationId,
    assessorUserId: assessment.assessorUserId,
    employeeId: assessment.employeeId,
    programId: assessment.programId,
    assessorAuthorizationId: evaluatorAuthorizationId,
    assessedAt: assessment.assessedAt.toISOString(),
    outcome: assessment.outcome,
    expiresOn: assessment.expiresAt?.toISOString().slice(0, 10) ?? null,
    evidence: assessment.fileId ? { id: assessment.fileId, sha256: fileSha256 } : null,
    notes: assessment.notes,
    results: [...elementResults].sort((a, b) => a.elementId.localeCompare(b.elementId)).map((row) => ({
      elementId: row.elementId, outcome: row.outcome, notes: row.notes ?? null,
    })),
    signedAt: signedAt.toISOString(),
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}
