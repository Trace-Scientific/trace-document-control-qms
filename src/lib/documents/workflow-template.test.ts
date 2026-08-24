import { describe, expect, it } from "vitest";
import type { AuthorizationContext } from "../security/authorization";
import {
  WorkflowTemplateService,
  WorkflowTemplateValidationError,
  type WorkflowTemplateStore,
} from "./workflow-template";

const context: AuthorizationContext = {
  userId: "manager-1",
  organizationId: "org-1",
  userState: "ACTIVE",
  grants: [{ permission: "document.review.manage", scopeType: "ORGANIZATION", scopeId: null }],
};
function fixture() {
  const calls: unknown[] = [];
  const store: WorkflowTemplateStore = {
    async list() { return []; },
    async createVersion(input) {
      calls.push(input);
      return { id: "template-1", key: input.key, version: 1, name: input.name, active: true, stages: input.stages };
    },
    async setActive(input) { calls.push(input); return true; },
  };
  return { store, calls };
}
describe("workflow template administration", () => {
  it("normalizes and versions a bounded stage definition", async () => {
    const f = fixture();
    await new WorkflowTemplateService(f.store, () => new Date("2026-08-25T00:00:00Z")).createVersion(context, {
      organizationId: "org-1", key: " sop-review ", name: " SOP review ", stages: [{ name: " Quality ", dueDays: 3 }],
    });
    expect(f.calls[0]).toMatchObject({ key: "sop-review", name: "SOP review", stages: [{ name: "Quality", dueDays: 3 }], actorUserId: "manager-1" });
  });
  it("rejects invalid stage deadlines", async () => {
    expect(() => new WorkflowTemplateService(fixture().store).createVersion(context, {
      organizationId: "org-1", key: "SOP", name: "SOP", stages: [{ name: "Quality", dueDays: 0 }],
    })).toThrow();
  });
  it("requires a reason for activation changes", async () => {
    await expect(new WorkflowTemplateService(fixture().store).setActive(context, {
      organizationId: "org-1", templateId: "template-1", active: false, reason: " ",
    })).rejects.toBeInstanceOf(WorkflowTemplateValidationError);
  });
});
