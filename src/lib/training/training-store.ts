import { Prisma } from "@prisma/client";
import { db } from "../db";
import type { TrainingAssignmentRecord, TrainingCompletionRecord, TrainingCourseRecord, TrainingStore } from "./training";
import { TrainingEligibilityError, TrainingValidationError } from "./training";

export class PrismaTrainingStore implements TrainingStore {
  async listCourses(organizationId: string): Promise<TrainingCourseRecord[]> {
    return db.$queryRaw<TrainingCourseRecord[]>(Prisma.sql`
      SELECT * FROM "TrainingCourse" WHERE "organizationId" = ${organizationId}::uuid ORDER BY "code"
    `);
  }

  async createCourse(input: { organizationId: string; code: string; title: string; description: string | null; actorUserId: string }): Promise<TrainingCourseRecord> {
    return db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<TrainingCourseRecord[]>(Prisma.sql`
        INSERT INTO "TrainingCourse" ("organizationId", "code", "title", "description")
        VALUES (${input.organizationId}::uuid, ${input.code}, ${input.title}, ${input.description}) RETURNING *
      `);
      const course = rows[0];
      if (!course) throw new TrainingValidationError("Training course could not be created");
      await tx.auditEvent.create({ data: { organizationId: input.organizationId, actorUserId: input.actorUserId, action: "TRAINING_COURSE_CREATED", entityType: "TrainingCourse", entityId: course.id, metadata: { code: course.code, title: course.title } } });
      return course;
    });
  }

  async listAssignments(organizationId: string, employeeId?: string): Promise<TrainingAssignmentRecord[]> {
    return db.$queryRaw<TrainingAssignmentRecord[]>(employeeId ? Prisma.sql`
      SELECT * FROM "TrainingAssignment" WHERE "organizationId" = ${organizationId}::uuid AND "employeeId" = ${employeeId}::uuid ORDER BY "assignedAt" DESC
    ` : Prisma.sql`
      SELECT * FROM "TrainingAssignment" WHERE "organizationId" = ${organizationId}::uuid ORDER BY "assignedAt" DESC
    `);
  }

  async createAssignment(input: { organizationId: string; employeeId: string; courseId: string; assignedAt: Date; dueAt: Date | null; actorUserId: string }): Promise<TrainingAssignmentRecord> {
    return db.$transaction(async (tx) => this.createAssignmentInTransaction(tx, input));
  }

  async cancelAssignment(input: { organizationId: string; assignmentId: string; reason: string; actorUserId: string }): Promise<TrainingAssignmentRecord> {
    return db.$transaction(async (tx) => {
      const assignment = await this.lockAssignable(tx, input.organizationId, input.assignmentId);
      const rows = await tx.$queryRaw<TrainingAssignmentRecord[]>(Prisma.sql`
        UPDATE "TrainingAssignment"
        SET "status" = 'CANCELLED', "cancelledAt" = CURRENT_TIMESTAMP, "cancelReason" = ${input.reason}, "cancelledByUserId" = ${input.actorUserId}::uuid, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "organizationId" = ${input.organizationId}::uuid AND "id" = ${assignment.id}::uuid
        RETURNING *
      `);
      const cancelled = rows[0];
      if (!cancelled) throw new TrainingValidationError("Training assignment could not be cancelled");
      await tx.auditEvent.create({ data: { organizationId: input.organizationId, actorUserId: input.actorUserId, action: "TRAINING_CANCELLED", entityType: "TrainingAssignment", entityId: cancelled.id, reason: input.reason, metadata: { employeeId: cancelled.employeeId, courseId: cancelled.courseId } } });
      return cancelled;
    });
  }

  async reassignAssignment(input: { organizationId: string; assignmentId: string; assignedAt: Date; dueAt: Date | null; reason: string; actorUserId: string }): Promise<TrainingAssignmentRecord> {
    return db.$transaction(async (tx) => {
      const prior = await this.lockAssignable(tx, input.organizationId, input.assignmentId);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "TrainingAssignment"
        SET "status" = 'CANCELLED', "cancelledAt" = CURRENT_TIMESTAMP, "cancelReason" = ${input.reason}, "cancelledByUserId" = ${input.actorUserId}::uuid, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "organizationId" = ${input.organizationId}::uuid AND "id" = ${prior.id}::uuid
      `);
      const replacement = await this.createAssignmentInTransaction(tx, {
        organizationId: input.organizationId,
        employeeId: prior.employeeId,
        courseId: prior.courseId,
        assignedAt: input.assignedAt,
        dueAt: input.dueAt,
        actorUserId: input.actorUserId,
      }, false);
      await tx.auditEvent.create({ data: { organizationId: input.organizationId, actorUserId: input.actorUserId, action: "TRAINING_REASSIGNED", entityType: "TrainingAssignment", entityId: replacement.id, reason: input.reason, metadata: { priorAssignmentId: prior.id, employeeId: replacement.employeeId, courseId: replacement.courseId, dueAt: replacement.dueAt?.toISOString() ?? null } } });
      return replacement;
    });
  }

  async completeAssignment(input: { organizationId: string; assignmentId: string; completedAt: Date; result: string | null; fileId: string | null; actorUserId: string }): Promise<TrainingCompletionRecord> {
    return db.$transaction(async (tx) => {
      const assignment = await this.lockAssignable(tx, input.organizationId, input.assignmentId);
      if (input.fileId) {
        const file = await tx.fileObject.findFirst({ where: { organizationId: input.organizationId, id: input.fileId }, select: { status: true } });
        if (!file) throw new Error("Access denied");
        if (file.status !== "AVAILABLE") throw new TrainingEligibilityError("Training evidence file must be AVAILABLE");
      }
      const rows = await tx.$queryRaw<TrainingCompletionRecord[]>(Prisma.sql`
        INSERT INTO "TrainingRecord" ("organizationId", "assignmentId", "employeeId", "courseId", "completedAt", "result", "fileId", "createdByUserId")
        VALUES (${input.organizationId}::uuid, ${assignment.id}::uuid, ${assignment.employeeId}::uuid, ${assignment.courseId}::uuid, ${input.completedAt}, ${input.result}, ${input.fileId}::uuid, ${input.actorUserId}::uuid) RETURNING *
      `);
      const record = rows[0];
      if (!record) throw new TrainingValidationError("Training completion could not be recorded");
      await tx.$executeRaw(Prisma.sql`UPDATE "TrainingAssignment" SET "status" = 'COMPLETED', "updatedAt" = CURRENT_TIMESTAMP WHERE "organizationId" = ${input.organizationId}::uuid AND "id" = ${assignment.id}::uuid`);
      await tx.auditEvent.create({ data: { organizationId: input.organizationId, actorUserId: input.actorUserId, action: "TRAINING_COMPLETED", entityType: "TrainingRecord", entityId: record.id, metadata: { assignmentId: record.assignmentId, employeeId: record.employeeId, courseId: record.courseId, completedAt: record.completedAt.toISOString(), fileId: record.fileId } } });
      return record;
    });
  }

  private async lockAssignable(tx: Prisma.TransactionClient, organizationId: string, assignmentId: string) {
    const assignments = await tx.$queryRaw<Array<TrainingAssignmentRecord>>(Prisma.sql`
      SELECT * FROM "TrainingAssignment" WHERE "organizationId" = ${organizationId}::uuid AND "id" = ${assignmentId}::uuid FOR UPDATE
    `);
    const assignment = assignments[0];
    if (!assignment) throw new Error("Access denied");
    if (assignment.status !== "ASSIGNED") throw new TrainingEligibilityError("Only ASSIGNED training can be changed");
    return assignment;
  }

  private async createAssignmentInTransaction(tx: Prisma.TransactionClient, input: { organizationId: string; employeeId: string; courseId: string; assignedAt: Date; dueAt: Date | null; actorUserId: string }, audit = true): Promise<TrainingAssignmentRecord> {
    const employees = await tx.$queryRaw<Array<{ status: string }>>(Prisma.sql`
      SELECT "status"::text AS "status" FROM "Employee" WHERE "organizationId" = ${input.organizationId}::uuid AND "id" = ${input.employeeId}::uuid
    `);
    if (!employees[0]) throw new Error("Access denied");
    if (employees[0].status === "TERMINATED") throw new TrainingEligibilityError("Training cannot be assigned to a terminated employee");
    const courses = await tx.$queryRaw<Array<{ active: boolean }>>(Prisma.sql`
      SELECT "active" FROM "TrainingCourse" WHERE "organizationId" = ${input.organizationId}::uuid AND "id" = ${input.courseId}::uuid
    `);
    if (!courses[0]) throw new Error("Access denied");
    if (!courses[0].active) throw new TrainingEligibilityError("Inactive training course cannot be assigned");

    const duplicate = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "TrainingAssignment"
      WHERE "organizationId" = ${input.organizationId}::uuid
        AND "employeeId" = ${input.employeeId}::uuid
        AND "courseId" = ${input.courseId}::uuid
        AND "assignedAt" = ${input.assignedAt}
        AND "dueAt" IS NOT DISTINCT FROM ${input.dueAt}
        AND "status" = 'ASSIGNED'
      LIMIT 1
    `);
    if (duplicate.length) {
      throw new TrainingValidationError("An identical active training assignment already exists. Use lifecycle reassign for governed schedule changes instead of duplicating the same assignment.");
    }

    const rows = await tx.$queryRaw<TrainingAssignmentRecord[]>(Prisma.sql`
      INSERT INTO "TrainingAssignment" ("organizationId", "employeeId", "courseId", "assignedAt", "dueAt", "createdByUserId")
      VALUES (${input.organizationId}::uuid, ${input.employeeId}::uuid, ${input.courseId}::uuid, ${input.assignedAt}, ${input.dueAt}, ${input.actorUserId}::uuid) RETURNING *
    `);
    const assignment = rows[0];
    if (!assignment) throw new TrainingValidationError("Training assignment could not be created");
    if (audit) await tx.auditEvent.create({ data: { organizationId: input.organizationId, actorUserId: input.actorUserId, action: "TRAINING_ASSIGNED", entityType: "TrainingAssignment", entityId: assignment.id, metadata: { employeeId: assignment.employeeId, courseId: assignment.courseId, dueAt: assignment.dueAt?.toISOString() ?? null } } });
    return assignment;
  }
}
