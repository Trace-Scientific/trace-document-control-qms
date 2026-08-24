import { db } from "../db";
import type {
  WorkflowTemplate,
  WorkflowTemplateStage,
  WorkflowTemplateStore,
} from "./workflow-template";

function stages(definition: unknown): WorkflowTemplateStage[] {
  if (!definition || typeof definition !== "object") return [];
  const value = (definition as { stages?: unknown }).stages;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is WorkflowTemplateStage =>
      !!item &&
      typeof item === "object" &&
      typeof (item as WorkflowTemplateStage).name === "string" &&
      typeof (item as WorkflowTemplateStage).dueDays === "number",
  );
}
const map = (row: {
  id: string;
  key: string;
  version: number;
  name: string;
  active: boolean;
  definition: unknown;
}): WorkflowTemplate => ({ ...row, stages: stages(row.definition) });

export class PrismaWorkflowTemplateStore implements WorkflowTemplateStore {
  async list(organizationId: string) {
    return (
      await db.workflowDefinition.findMany({
        where: { organizationId },
        orderBy: [{ key: "asc" }, { version: "desc" }],
      })
    ).map(map);
  }
  async createVersion(input: Parameters<WorkflowTemplateStore["createVersion"]>[0]) {
    return db.$transaction(async (transaction) => {
      const latest = await transaction.workflowDefinition.findFirst({
        where: { organizationId: input.organizationId, key: input.key },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      await transaction.workflowDefinition.updateMany({
        where: { organizationId: input.organizationId, key: input.key, active: true },
        data: { active: false },
      });
      const created = await transaction.workflowDefinition.create({
        data: {
          organizationId: input.organizationId,
          key: input.key,
          version: (latest?.version ?? 0) + 1,
          name: input.name,
          active: true,
          definition: {
            stages: input.stages.map((stage) => ({
              name: stage.name,
              dueDays: stage.dueDays,
            })),
          },
        },
      });
      await transaction.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: "WORKFLOW_TEMPLATE_VERSION_CREATED",
          entityType: "WorkflowDefinition",
          entityId: created.id,
          occurredAt: input.occurredAt,
          metadata: { key: input.key, version: created.version },
        },
      });
      return map(created);
    });
  }
  async setActive(input: Parameters<WorkflowTemplateStore["setActive"]>[0]) {
    return db.$transaction(async (transaction) => {
      const template = await transaction.workflowDefinition.findFirst({
        where: { id: input.templateId, organizationId: input.organizationId },
        select: { id: true, key: true, active: true },
      });
      if (!template || template.active === input.active) return false;
      if (input.active)
        await transaction.workflowDefinition.updateMany({
          where: { organizationId: input.organizationId, key: template.key, active: true },
          data: { active: false },
        });
      await transaction.workflowDefinition.update({
        where: { id: template.id },
        data: { active: input.active },
      });
      await transaction.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: input.active ? "WORKFLOW_TEMPLATE_ACTIVATED" : "WORKFLOW_TEMPLATE_DEACTIVATED",
          entityType: "WorkflowDefinition",
          entityId: template.id,
          reason: input.reason,
          occurredAt: input.occurredAt,
        },
      });
      return true;
    });
  }
}
