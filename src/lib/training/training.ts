import type { AuthorizationContext } from "../security/authorization";
import { requireAuthorization } from "../security/authorization";

export class TrainingValidationError extends Error {}
export class TrainingEligibilityError extends Error {}

export type TrainingCourseRecord = {
  id: string; organizationId: string; code: string; title: string; description: string | null; active: boolean; createdAt: Date; updatedAt: Date;
};
export type TrainingAssignmentRecord = {
  id: string; organizationId: string; employeeId: string; courseId: string; assignedAt: Date; dueAt: Date | null; status: "ASSIGNED" | "COMPLETED" | "CANCELLED"; createdByUserId: string; createdAt: Date; updatedAt: Date; cancelledAt?: Date | null; cancelReason?: string | null; cancelledByUserId?: string | null;
};
export type TrainingCompletionRecord = {
  id: string; organizationId: string; assignmentId: string; employeeId: string; courseId: string; completedAt: Date; result: string | null; fileId: string | null; createdByUserId: string; createdAt: Date; evidenceName?: string | null; evidenceStatus?: string | null;
};

export interface TrainingStore {
  listCourses(organizationId: string): Promise<TrainingCourseRecord[]>;
  createCourse(input: { organizationId: string; code: string; title: string; description: string | null; actorUserId: string }): Promise<TrainingCourseRecord>;
  listAssignments(organizationId: string, employeeId?: string): Promise<TrainingAssignmentRecord[]>;
  createAssignment(input: { organizationId: string; employeeId: string; courseId: string; assignedAt: Date; dueAt: Date | null; actorUserId: string }): Promise<TrainingAssignmentRecord>;
  cancelAssignment(input: { organizationId: string; assignmentId: string; reason: string; actorUserId: string }): Promise<TrainingAssignmentRecord>;
  reassignAssignment(input: { organizationId: string; assignmentId: string; assignedAt: Date; dueAt: Date | null; reason: string; actorUserId: string }): Promise<TrainingAssignmentRecord>;
  listCompletions(organizationId: string, employeeId?: string): Promise<TrainingCompletionRecord[]>;
  completeAssignment(input: { organizationId: string; assignmentId: string; completedAt: Date; result: string | null; fileId: string | null; actorUserId: string }): Promise<TrainingCompletionRecord>;
}

export class TrainingService {
  constructor(private readonly store: TrainingStore) {}

  listCourses(context: AuthorizationContext, organizationId: string) {
    requireAuthorization(context, { organizationId, permission: "training.read" });
    return this.store.listCourses(organizationId);
  }

  createCourse(context: AuthorizationContext, input: { organizationId: string; code: string; title: string; description?: string | null }) {
    requireAuthorization(context, { organizationId: input.organizationId, permission: "training.manage" });
    const code = input.code.trim();
    const title = input.title.trim();
    const description = input.description?.trim() || null;
    if (!code || code.length > 80) throw new TrainingValidationError("Training course code is required");
    if (!title || title.length > 240) throw new TrainingValidationError("Training course title is required");
    if ((description?.length ?? 0) > 2000) throw new TrainingValidationError("Training course description is too long");
    return this.store.createCourse({ organizationId: input.organizationId, code, title, description, actorUserId: context.userId });
  }

  listAssignments(context: AuthorizationContext, organizationId: string, employeeId?: string) {
    requireAuthorization(context, { organizationId, permission: "training.read" });
    return this.store.listAssignments(organizationId, employeeId);
  }

  createAssignment(context: AuthorizationContext, input: { organizationId: string; employeeId: string; courseId: string; assignedAt: Date; dueAt?: Date | null }) {
    requireAuthorization(context, { organizationId: input.organizationId, permission: "training.manage" });
    const dueAt = input.dueAt ?? null;
    validateAssignmentDates(input.assignedAt, dueAt);
    return this.store.createAssignment({ organizationId: input.organizationId, employeeId: input.employeeId, courseId: input.courseId, assignedAt: input.assignedAt, dueAt, actorUserId: context.userId });
  }

  cancelAssignment(context: AuthorizationContext, input: { organizationId: string; assignmentId: string; reason: string }) {
    requireAuthorization(context, { organizationId: input.organizationId, permission: "training.manage" });
    const reason = input.reason.trim();
    if (!reason || reason.length > 500) throw new TrainingValidationError("Training cancellation reason is required");
    return this.store.cancelAssignment({ organizationId: input.organizationId, assignmentId: input.assignmentId, reason, actorUserId: context.userId });
  }

  reassignAssignment(context: AuthorizationContext, input: { organizationId: string; assignmentId: string; assignedAt: Date; dueAt?: Date | null; reason: string }) {
    requireAuthorization(context, { organizationId: input.organizationId, permission: "training.manage" });
    const dueAt = input.dueAt ?? null;
    const reason = input.reason.trim();
    validateAssignmentDates(input.assignedAt, dueAt);
    if (!reason || reason.length > 500) throw new TrainingValidationError("Training reassignment reason is required");
    return this.store.reassignAssignment({ organizationId: input.organizationId, assignmentId: input.assignmentId, assignedAt: input.assignedAt, dueAt, reason, actorUserId: context.userId });
  }

  listCompletions(context: AuthorizationContext, organizationId: string, employeeId?: string) {
    requireAuthorization(context, { organizationId, permission: "training.read" });
    return this.store.listCompletions(organizationId, employeeId);
  }

  completeAssignment(context: AuthorizationContext, input: { organizationId: string; assignmentId: string; completedAt: Date; result?: string | null; fileId?: string | null }) {
    requireAuthorization(context, { organizationId: input.organizationId, permission: "training.manage" });
    const result = input.result?.trim() || null;
    if (Number.isNaN(input.completedAt.getTime())) throw new TrainingValidationError("Training completion date is invalid");
    if ((result?.length ?? 0) > 500) throw new TrainingValidationError("Training result is too long");
    return this.store.completeAssignment({ organizationId: input.organizationId, assignmentId: input.assignmentId, completedAt: input.completedAt, result, fileId: input.fileId ?? null, actorUserId: context.userId });
  }
}

function validateAssignmentDates(assignedAt: Date, dueAt: Date | null) {
  if (Number.isNaN(assignedAt.getTime())) throw new TrainingValidationError("Training assignment date is invalid");
  if (dueAt && Number.isNaN(dueAt.getTime())) throw new TrainingValidationError("Training due date is invalid");
  if (dueAt && dueAt < assignedAt) throw new TrainingValidationError("Training due date cannot precede assignment date");
}
