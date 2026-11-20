import { describe, expect, it } from "vitest";
import type { AuthorizationContext } from "../security/authorization";
import type { TrainingStore } from "./training";
import { previewAssignedDemoQuiz } from "./demo-assessment-preview";

const org = "11111111-1111-4111-8111-111111111111";
const other = "99999999-9999-4999-8999-999999999999";
const assignmentId = "22222222-2222-4222-8222-222222222222";
const courseId = "33333333-3333-4333-8333-333333333333";
const ctx = (permission: string): AuthorizationContext => ({ organizationId: org, userId: "44444444-4444-4444-8444-444444444444", userState: "ACTIVE", grants: [{ permission, scopeType: "ORGANIZATION", scopeId: null }] });
function store(status: "ASSIGNED" | "COMPLETED" | "CANCELLED" = "ASSIGNED", code = "DEMO-HIPAA"): Pick<TrainingStore, "listAssignments" | "listCourses"> {
  return {
    async listAssignments() { return [{ id: assignmentId, organizationId: org, employeeId: "55555555-5555-4555-8555-555555555555", courseId, status, assignedAt: new Date(), dueAt: null, createdByUserId: ctx("training.manage").userId, createdAt: new Date(), updatedAt: new Date() }]; },
    async listCourses() { return [{ id: courseId, organizationId: org, code, title: "Demo", description: null, active: true, createdAt: new Date(), updatedAt: new Date() }]; },
  };
}
describe("read-only demo assessment preview authorization", () => {
  const input = { organizationId: org, assignmentId, answers: [1, 1, 0] };
  it("scores a valid assigned demo course without recording a completion", async () => {
    await expect(previewAssignedDemoQuiz(ctx("training.manage"), store(), input)).resolves.toEqual({ assignmentId, courseCode: "DEMO-HIPAA", correct: 3, total: 3, percentage: 100, recorded: false });
  });
  it("denies read-only users before accessing the store", async () => {
    let called = false;
    const guarded = { async listAssignments() { called = true; return []; }, async listCourses() { called = true; return []; } };
    await expect(previewAssignedDemoQuiz(ctx("training.read"), guarded, input)).rejects.toThrow("Access denied");
    expect(called).toBe(false);
  });
  it("denies cross-tenant requests before accessing the store", async () => {
    await expect(previewAssignedDemoQuiz(ctx("training.manage"), store(), { ...input, organizationId: other })).rejects.toThrow("Access denied");
  });
  it("rejects completed assignments and unsupported courses", async () => {
    await expect(previewAssignedDemoQuiz(ctx("training.manage"), store("COMPLETED"), input)).rejects.toThrow("Only active");
    await expect(previewAssignedDemoQuiz(ctx("training.manage"), store("ASSIGNED", "CUSTOM"), input)).rejects.toThrow("Unknown demo");
  });
  it("denies an assignment not found in the authorized tenant", async () => {
    await expect(previewAssignedDemoQuiz(ctx("training.manage"), store(), { ...input, assignmentId: "66666666-6666-4666-8666-666666666666" })).rejects.toThrow("Access denied");
  });
});
