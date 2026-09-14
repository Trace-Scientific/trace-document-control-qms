import { Prisma } from "@prisma/client";
import { db } from "../db";
import type { EmployeeJobAssignmentRecord, EmployeeRecord, EmployeeStatus, JobDescriptionRecord, PersonnelStore } from "./personnel";
import { PersonnelEligibilityError, PersonnelValidationError } from "./personnel";

export class PrismaPersonnelStore implements PersonnelStore {
  async listEmployees(organizationId: string): Promise<EmployeeRecord[]> {
    return db.$queryRaw<EmployeeRecord[]>(Prisma.sql`
      SELECT * FROM "Employee"
      WHERE "organizationId" = ${organizationId}::uuid
      ORDER BY "lastName", "firstName", "employeeNumber"
    `);
  }

  async createEmployee(input: { organizationId: string; userId: string | null; employeeNumber: string; firstName: string; lastName: string; hireDate: Date | null; actorUserId: string }): Promise<EmployeeRecord> {
    return db.$transaction(async (tx) => {
      if (input.userId) {
        const user = await tx.user.findFirst({ where: { organizationId: input.organizationId, id: input.userId }, select: { id: true } });
        if (!user) throw new Error("Access denied");
        const linked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "Employee"
          WHERE "organizationId" = ${input.organizationId}::uuid AND "userId" = ${input.userId}::uuid
        `);
        if (linked.length) throw new PersonnelValidationError("This user account is already linked to an employee record");
      }
      const duplicate = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "Employee"
        WHERE "organizationId" = ${input.organizationId}::uuid AND "employeeNumber" = ${input.employeeNumber}
      `);
      if (duplicate.length) throw new PersonnelValidationError("Employee number already exists");
      const rows = await tx.$queryRaw<EmployeeRecord[]>(Prisma.sql`
        INSERT INTO "Employee" ("organizationId", "userId", "employeeNumber", "firstName", "lastName", "hireDate")
        VALUES (${input.organizationId}::uuid, ${input.userId}::uuid, ${input.employeeNumber}, ${input.firstName}, ${input.lastName}, ${input.hireDate})
        RETURNING *
      `);
      const employee = rows[0]!;
      await tx.auditEvent.create({ data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: "EMPLOYEE_CREATED",
        entityType: "Employee",
        entityId: employee.id,
        entityVersion: employee.employeeNumber,
        metadata: { employeeNumber: employee.employeeNumber, userId: employee.userId, status: employee.status, hireDate: employee.hireDate?.toISOString() ?? null },
      }});
      return employee;
    });
  }

  async transitionEmployee(input: { organizationId: string; employeeId: string; targetStatus: EmployeeStatus; effectiveDate: Date | null; reason: string; actorUserId: string }): Promise<EmployeeRecord> {
    return db.$transaction(async (tx) => {
      const currentRows = await tx.$queryRaw<EmployeeRecord[]>(Prisma.sql`
        SELECT * FROM "Employee"
        WHERE "organizationId" = ${input.organizationId}::uuid AND "id" = ${input.employeeId}::uuid
        FOR UPDATE
      `);
      const current = currentRows[0];
      if (!current) throw new Error("Access denied");
      if (current.status === "TERMINATED") throw new PersonnelEligibilityError("Terminated employees cannot be reactivated or changed");
      if (current.status === input.targetStatus) throw new PersonnelEligibilityError("Employee is already in the requested status");
      if (input.targetStatus === "TERMINATED" && input.effectiveDate && current.hireDate && input.effectiveDate < current.hireDate) {
        throw new PersonnelValidationError("Termination date cannot precede hire date");
      }

      const terminationDate = input.targetStatus === "TERMINATED" ? input.effectiveDate : null;
      const updatedRows = await tx.$queryRaw<EmployeeRecord[]>(Prisma.sql`
        UPDATE "Employee"
        SET "status" = ${input.targetStatus}::"EmployeeStatus",
            "terminationDate" = ${terminationDate},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "organizationId" = ${input.organizationId}::uuid AND "id" = ${input.employeeId}::uuid
        RETURNING *
      `);
      const updated = updatedRows[0]!;

      let closedAssignments: Array<{ id: string }> = [];
      if (input.targetStatus === "TERMINATED" && terminationDate) {
        closedAssignments = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          UPDATE "EmployeeJobAssignment"
          SET "endedAt" = ${terminationDate}
          WHERE "organizationId" = ${input.organizationId}::uuid
            AND "employeeId" = ${input.employeeId}::uuid
            AND "endedAt" IS NULL
            AND "assignedAt" <= ${terminationDate}
          RETURNING "id"
        `);
      }

      await tx.auditEvent.create({ data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: "EMPLOYEE_STATUS_CHANGED",
        entityType: "Employee",
        entityId: updated.id,
        entityVersion: updated.employeeNumber,
        metadata: {
          fromStatus: current.status,
          toStatus: updated.status,
          effectiveDate: input.effectiveDate?.toISOString() ?? null,
          reason: input.reason,
          closedAssignmentIds: closedAssignments.map((assignment) => assignment.id),
        },
      }});
      return updated;
    });
  }

  async listJobDescriptions(organizationId: string): Promise<JobDescriptionRecord[]> {
    return db.$queryRaw<JobDescriptionRecord[]>(Prisma.sql`
      SELECT * FROM "JobDescription"
      WHERE "organizationId" = ${organizationId}::uuid
      ORDER BY "code"
    `);
  }

  async createJobDescription(input: { organizationId: string; code: string; title: string; summary: string | null; actorUserId: string }): Promise<JobDescriptionRecord> {
    return db.$transaction(async (tx) => {
      const duplicate = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "JobDescription"
        WHERE "organizationId" = ${input.organizationId}::uuid AND "code" = ${input.code}
      `);
      if (duplicate.length) throw new PersonnelValidationError("Job description code already exists");
      const rows = await tx.$queryRaw<JobDescriptionRecord[]>(Prisma.sql`
        INSERT INTO "JobDescription" ("organizationId", "code", "title", "summary")
        VALUES (${input.organizationId}::uuid, ${input.code}, ${input.title}, ${input.summary})
        RETURNING *
      `);
      const job = rows[0]!;
      await tx.auditEvent.create({ data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: "JOB_DESCRIPTION_CREATED",
        entityType: "JobDescription",
        entityId: job.id,
        entityVersion: job.code,
        metadata: { code: job.code, title: job.title, active: job.active },
      }});
      return job;
    });
  }

  async listAssignments(organizationId: string, employeeId?: string): Promise<EmployeeJobAssignmentRecord[]> {
    type AssignmentReadRow = Omit<EmployeeJobAssignmentRecord, "assignedAt" | "endedAt" | "createdAt"> & {
      assignedAt: string;
      endedAt: string | null;
      createdAt: string;
    };
    const rows = await db.$queryRaw<AssignmentReadRow[]>(employeeId ? Prisma.sql`
      SELECT
        "id", "organizationId", "employeeId", "jobDescriptionId", "siteId", "departmentId", "isPrimary",
        "assignedAt"::text AS "assignedAt",
        "endedAt"::text AS "endedAt",
        "createdByUserId",
        "createdAt"::text AS "createdAt"
      FROM "EmployeeJobAssignment"
      WHERE "organizationId" = ${organizationId}::uuid AND "employeeId" = ${employeeId}::uuid
      ORDER BY "assignedAt" DESC, "createdAt" DESC
    ` : Prisma.sql`
      SELECT
        "id", "organizationId", "employeeId", "jobDescriptionId", "siteId", "departmentId", "isPrimary",
        "assignedAt"::text AS "assignedAt",
        "endedAt"::text AS "endedAt",
        "createdByUserId",
        "createdAt"::text AS "createdAt"
      FROM "EmployeeJobAssignment"
      WHERE "organizationId" = ${organizationId}::uuid
      ORDER BY "assignedAt" DESC, "createdAt" DESC
    `);
    return rows.map((row) => ({
      ...row,
      assignedAt: new Date(`${row.assignedAt}T00:00:00.000Z`),
      endedAt: row.endedAt ? new Date(`${row.endedAt}T00:00:00.000Z`) : null,
      createdAt: new Date(row.createdAt),
    }));
  }

  async createAssignment(input: { organizationId: string; employeeId: string; jobDescriptionId: string; siteId: string | null; departmentId: string | null; isPrimary: boolean; assignedAt: Date; actorUserId: string }): Promise<EmployeeJobAssignmentRecord> {
    return db.$transaction(async (tx) => {
      const [employee, jobs] = await Promise.all([
        tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
          SELECT "id", "status"::text AS "status" FROM "Employee"
          WHERE "organizationId" = ${input.organizationId}::uuid AND "id" = ${input.employeeId}::uuid
        `),
        tx.$queryRaw<Array<{ id: string; active: boolean }>>(Prisma.sql`
          SELECT "id", "active" FROM "JobDescription"
          WHERE "organizationId" = ${input.organizationId}::uuid AND "id" = ${input.jobDescriptionId}::uuid
        `),
      ]);
      if (!employee[0] || !jobs[0]) throw new Error("Access denied");
      if (employee[0].status !== "ACTIVE") throw new PersonnelEligibilityError("Only active employees can receive new job assignments");
      if (!jobs[0].active) throw new PersonnelEligibilityError("Inactive job descriptions cannot receive new assignments");

      if (input.siteId) {
        const site = await tx.site.findFirst({ where: { organizationId: input.organizationId, id: input.siteId, active: true }, select: { id: true } });
        if (!site) throw new Error("Access denied");
      }
      if (input.departmentId) {
        const department = await tx.department.findFirst({ where: { organizationId: input.organizationId, id: input.departmentId, active: true }, select: { id: true, siteId: true } });
        if (!department) throw new Error("Access denied");
        if (input.siteId && department.siteId && department.siteId !== input.siteId) throw new PersonnelValidationError("Department does not belong to the selected site");
      }
      if (input.isPrimary) {
        const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "EmployeeJobAssignment"
          WHERE "organizationId" = ${input.organizationId}::uuid
            AND "employeeId" = ${input.employeeId}::uuid
            AND "isPrimary" = true
            AND "endedAt" IS NULL
        `);
        if (existing.length) throw new PersonnelEligibilityError("Employee already has an active primary job assignment");
      }

      const rows = await tx.$queryRaw<EmployeeJobAssignmentRecord[]>(Prisma.sql`
        INSERT INTO "EmployeeJobAssignment" (
          "organizationId", "employeeId", "jobDescriptionId", "siteId", "departmentId", "isPrimary", "assignedAt", "createdByUserId"
        ) VALUES (
          ${input.organizationId}::uuid, ${input.employeeId}::uuid, ${input.jobDescriptionId}::uuid,
          ${input.siteId}::uuid, ${input.departmentId}::uuid, ${input.isPrimary}, ${input.assignedAt}, ${input.actorUserId}::uuid
        ) RETURNING *
      `);
      const assignment = rows[0]!;
      await tx.auditEvent.create({ data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: "EMPLOYEE_JOB_ASSIGNED",
        entityType: "EmployeeJobAssignment",
        entityId: assignment.id,
        metadata: {
          employeeId: assignment.employeeId,
          jobDescriptionId: assignment.jobDescriptionId,
          siteId: assignment.siteId,
          departmentId: assignment.departmentId,
          isPrimary: assignment.isPrimary,
          assignedAt: assignment.assignedAt.toISOString(),
        },
      }});
      return assignment;
    });
  }

  async endAssignment(input: { organizationId: string; assignmentId: string; endedAt: Date; reason: string; actorUserId: string }): Promise<EmployeeJobAssignmentRecord> {
    return db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<EmployeeJobAssignmentRecord[]>(Prisma.sql`
        SELECT * FROM "EmployeeJobAssignment"
        WHERE "organizationId" = ${input.organizationId}::uuid AND "id" = ${input.assignmentId}::uuid
        FOR UPDATE
      `);
      const current = rows[0];
      if (!current) throw new Error("Access denied");
      if (current.endedAt) throw new PersonnelEligibilityError("Job assignment has already ended");
      if (input.endedAt < current.assignedAt) throw new PersonnelValidationError("Assignment end date cannot precede assignment date");

      const updatedRows = await tx.$queryRaw<EmployeeJobAssignmentRecord[]>(Prisma.sql`
        UPDATE "EmployeeJobAssignment"
        SET "endedAt" = ${input.endedAt}
        WHERE "organizationId" = ${input.organizationId}::uuid AND "id" = ${input.assignmentId}::uuid
        RETURNING *
      `);
      const updated = updatedRows[0]!;
      await tx.auditEvent.create({ data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: "EMPLOYEE_JOB_ASSIGNMENT_ENDED",
        entityType: "EmployeeJobAssignment",
        entityId: updated.id,
        metadata: {
          employeeId: updated.employeeId,
          jobDescriptionId: updated.jobDescriptionId,
          assignedAt: updated.assignedAt.toISOString(),
          endedAt: updated.endedAt?.toISOString() ?? null,
          reason: input.reason,
        },
      }});
      return updated;
    });
  }
}
