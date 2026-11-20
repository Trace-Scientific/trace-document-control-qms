import { describe, expect, it } from "vitest";
import type { AuthorizationContext } from "../security/authorization";
import { resolveOwnTrainingAssignments } from "./employee-training";

const context: AuthorizationContext = { organizationId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222", userState: "ACTIVE", grants: [] };
const employee = { id: "33333333-3333-4333-8333-333333333333", status: "ACTIVE" };
describe("employee training identity boundary", () => {
  it("resolves one active personnel link without requiring management privileges", () => {
    expect(resolveOwnTrainingAssignments(context, [employee])).toEqual({ id: employee.id });
  });
  it("denies missing, duplicate, inactive, or terminated employee links", () => {
    for (const employees of [[], [employee, employee], [{ ...employee, status: "INACTIVE" }], [{ ...employee, status: "TERMINATED" }]]) {
      expect(() => resolveOwnTrainingAssignments(context, employees)).toThrow("Access denied");
    }
  });
  it("denies inactive accounts even if employee is active", () => {
    expect(() => resolveOwnTrainingAssignments({ ...context, userState: "SUSPENDED" }, [employee])).toThrow("Access denied");
  });
});
