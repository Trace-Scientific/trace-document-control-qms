import { describe, expect, it } from "vitest";
import type { AuthorizationContext } from "../security/authorization";
import type { TrainingStore } from "./training";
import { previewOwnDemoQuiz } from "./employee-demo-assessment-preview";

const org = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";
const assignmentId = "33333333-3333-4333-8333-333333333333";
const courseId = "44444444-4444-4444-8444-444444444444";
const context: AuthorizationContext = { organizationId: org, userId: "55555555-5555-4555-8555-555555555555", userState: "ACTIVE", grants: [] };
const employees = [{ id: employeeId, status: "ACTIVE" }];
const input = { assignmentId, answers: [1, 1, 0] };
function store(owner = employeeId, status: "ASSIGNED" | "COMPLETED" = "ASSIGNED"): Pick<TrainingStore, "listAssignments" | "listCourses"> {
  return {
    async listAssignments() { return [{ id: assignmentId, organizationId: org, employeeId: owner, courseId, assignedAt: new Date(), dueAt: null, status, createdByUserId: context.userId, createdAt: new Date(), updatedAt: new Date() }]; },
    async listCourses() { return [{ id: courseId, organizationId: org, code: "DEMO-HIPAA", title: "Demo", description: null, active: true, createdAt: new Date(), updatedAt: new Date() }]; },
  };
}
describe("employee practice scoring boundary", () => {
  it("allows the linked active employee without manager permission", async () => {
    await expect(previewOwnDemoQuiz(context, employees, store(), input)).resolves.toEqual({ assignmentId, courseCode: "DEMO-HIPAA", correct: 3, total: 3, percentage: 100, recorded: false });
  });
  it("denies another employee's assignment", async () => {
    await expect(previewOwnDemoQuiz(context, employees, store("66666666-6666-4666-8666-666666666666"), input)).rejects.toThrow("Access denied");
  });
  it("denies missing employee linkage", async () => {
    await expect(previewOwnDemoQuiz(context, [], store(), input)).rejects.toThrow("Access denied");
  });
  it("denies completed assignments", async () => {
    await expect(previewOwnDemoQuiz(context, employees, store(employeeId, "COMPLETED"), input)).rejects.toThrow("Only active");
  });
});
