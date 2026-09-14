import { Prisma } from "@prisma/client";
import { db } from "../db";
import type { EmployeeCredentialRecord, PersonnelCredentialStore } from "./credentials";
import { PersonnelEligibilityError, PersonnelValidationError } from "./personnel";

export class PrismaPersonnelCredentialStore implements PersonnelCredentialStore {
  async listCredentials(organizationId: string, employeeId?: string): Promise<EmployeeCredentialRecord[]> {
    return db.$queryRaw<EmployeeCredentialRecord[]>(employeeId ? Prisma.sql`
      SELECT * FROM "EmployeeCredential"
      WHERE "organizationId" = ${organizationId}::uuid AND "employeeId" = ${employeeId}::uuid
      ORDER BY "expiresAt" NULLS LAST, "createdAt" DESC
    ` : Prisma.sql`
      SELECT * FROM "EmployeeCredential"
      WHERE "organizationId" = ${organizationId}::uuid
      ORDER BY "expiresAt" NULLS LAST, "createdAt" DESC
    `);
  }

  async createCredential(input: {
    organizationId: string;
    employeeId: string;
    credentialType: string;
    credentialNumber: string | null;
    issuingAuthority: string | null;
    issuedAt: Date | null;
    expiresAt: Date | null;
    fileId: string | null;
    actorUserId: string;
  }): Promise<EmployeeCredentialRecord> {
    return db.$transaction(async (tx) => {
      const employees = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
        SELECT "id", "status"::text AS "status" FROM "Employee"
        WHERE "organizationId" = ${input.organizationId}::uuid AND "id" = ${input.employeeId}::uuid
      `);
      const employee = employees[0];
      if (!employee) throw new Error("Access denied");
      if (employee.status === "TERMINATED") throw new PersonnelEligibilityError("Credentials cannot be added to a terminated employee");

      if (input.fileId) {
        const file = await tx.fileObject.findFirst({
          where: { organizationId: input.organizationId, id: input.fileId },
          select: { id: true, status: true, sha256: true },
        });
        if (!file) throw new Error("Access denied");
        if (file.status !== "AVAILABLE") throw new PersonnelEligibilityError("Credential evidence file must be AVAILABLE");
      }

      const duplicate = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "EmployeeCredential"
        WHERE "organizationId" = ${input.organizationId}::uuid
          AND "employeeId" = ${input.employeeId}::uuid
          AND "credentialType" = ${input.credentialType}
          AND "credentialNumber" IS NOT DISTINCT FROM ${input.credentialNumber}
          AND "issuingAuthority" IS NOT DISTINCT FROM ${input.issuingAuthority}
          AND "issuedAt" IS NOT DISTINCT FROM ${input.issuedAt}
          AND "expiresAt" IS NOT DISTINCT FROM ${input.expiresAt}
          AND "fileId" IS NOT DISTINCT FROM ${input.fileId}::uuid
        LIMIT 1
      `);
      if (duplicate.length) {
        throw new PersonnelValidationError("An identical credential record already exists. Record renewals or corrected credentials with their new governed details instead of duplicating the same entry.");
      }

      const rows = await tx.$queryRaw<EmployeeCredentialRecord[]>(Prisma.sql`
        INSERT INTO "EmployeeCredential" (
          "organizationId", "employeeId", "credentialType", "credentialNumber", "issuingAuthority",
          "issuedAt", "expiresAt", "fileId", "createdByUserId"
        ) VALUES (
          ${input.organizationId}::uuid, ${input.employeeId}::uuid, ${input.credentialType}, ${input.credentialNumber},
          ${input.issuingAuthority}, ${input.issuedAt}, ${input.expiresAt}, ${input.fileId}::uuid, ${input.actorUserId}::uuid
        ) RETURNING *
      `);
      const credential = rows[0];
      if (!credential) throw new PersonnelValidationError("Credential could not be created");

      await tx.auditEvent.create({ data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: "EMPLOYEE_CREDENTIAL_CREATED",
        entityType: "EmployeeCredential",
        entityId: credential.id,
        metadata: {
          employeeId: credential.employeeId,
          credentialType: credential.credentialType,
          credentialNumber: credential.credentialNumber,
          issuingAuthority: credential.issuingAuthority,
          issuedAt: credential.issuedAt?.toISOString() ?? null,
          expiresAt: credential.expiresAt?.toISOString() ?? null,
          fileId: credential.fileId,
        },
      }});
      return credential;
    });
  }
}
