import { describe, expect, it } from "vitest";
import type { AuthorizationContext } from "../security/authorization";
import { TrainingService, TrainingValidationError, type TrainingStore } from "./training";

const organizationId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const employeeId = "33333333-3333-4333-8333-333333333333";
const courseId = "44444444-4444-4444-8444-444444444444";
const assignmentId = "55555555-5555-4555-8555-555555555555";

function context(permission: string): AuthorizationContext {
  return { userId, organizationId, userState: "ACTIVE", grants: [{ permission, scopeType: "ORGANIZATION", scopeId: null }] };
}

function assignment(input: { assignedAt: Date; dueAt: Date | null; actorUserId: string }) {
  return { id: assignmentId, organizationId, employeeId, courseId, assignedAt: input.assignedAt, dueAt: input.dueAt, status: "ASSIGNED" as const, createdByUserId: input.actorUserId, createdAt: new Date(), updatedAt: new Date() };
}

function store(): TrainingStore {
  return {
    async listCourses() { return []; },
    async createCourse(input) { return { id: courseId, organizationId: input.organizationId, code: input.code, title: input.title, description: input.description, active: true, createdAt: new Date(), updatedAt: new Date() }; },
    async listAssignments() { return []; },
    async createAssignment(input) { return assignment(input); },
    async cancelAssignment(input) { return { ...assignment({ assignedAt: new Date(), dueAt: null, actorUserId: input.actorUserId }), status: "CANCELLED" as const, cancelReason: input.reason, cancelledAt: new Date(), cancelledByUserId: input.actorUserId }; },
    async reassignAssignment(input) { return assignment(input); },
    async listCompletions() { return []; },
    async completeAssignment(input) { return { id: "66666666-6666-4666-8666-666666666666", organizationId: input.organizationId, assignmentId: input.assignmentId, employeeId, courseId, completedAt: input.completedAt, result: input.result, fileId: input.fileId, createdByUserId: input.actorUserId, createdAt: new Date() }; },
  };
}

describe("training service", () => {
  it("requires training.read for listings", () => {
    const service = new TrainingService(store());
    expect(() => service.listCourses({ ...context("training.read"), grants: [] }, organizationId)).toThrow("Access denied");
    expect(() => service.listCompletions({ ...context("training.read"), grants: [] }, organizationId)).toThrow("Access denied");
  });

  it("allows completion history with training.read", async () => {
    const service = new TrainingService(store());
    await expect(service.listCompletions(context("training.read"), organizationId)).resolves.toEqual([]);
  });

  it("requires training.manage for course creation", () => {
    const service = new TrainingService(store());
    expect(() => service.createCourse(context("training.read"), { organizationId, code: "TRN-1", title: "Training" })).toThrow("Access denied");
  });

  it("normalizes course fields", async () => {
    const service = new TrainingService(store());
    const result = await service.createCourse(context("training.manage"), { organizationId, code: " TRN-1 ", title: " General Training ", description: " Intro " });
    expect(result.code).toBe("TRN-1");
    expect(result.title).toBe("General Training");
    expect(result.description).toBe("Intro");
  });

  it("rejects due dates before assignment date", () => {
    const service = new TrainingService(store());
    expect(() => service.createAssignment(context("training.manage"), { organizationId, employeeId, courseId, assignedAt: new Date("2026-09-07T00:00:00Z"), dueAt: new Date("2026-09-06T00:00:00Z") })).toThrow(TrainingValidationError);
  });

  it("requires a cancellation reason", () => {
    const service = new TrainingService(store());
    expect(() => service.cancelAssignment(context("training.manage"), { organizationId, assignmentId, reason: "   " })).toThrow(TrainingValidationError);
  });

  it("validates reassignment dates", () => {
    const service = new TrainingService(store());
    expect(() => service.reassignAssignment(context("training.manage"), { organizationId, assignmentId, assignedAt: new Date("2026-09-07T00:00:00Z"), dueAt: new Date("2026-09-06T00:00:00Z"), reason: "Schedule correction" })).toThrow(TrainingValidationError);
  });

  it("requires training.manage for completion", () => {
    const service = new TrainingService(store());
    expect(() => service.completeAssignment(context("training.read"), { organizationId, assignmentId, completedAt: new Date("2026-09-07T12:00:00Z") })).toThrow("Access denied");
  });
});
