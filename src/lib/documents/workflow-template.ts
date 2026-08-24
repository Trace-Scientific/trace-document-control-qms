import {
  requireAuthorization,
  type AuthorizationContext,
} from "../security/authorization";

export interface WorkflowTemplateStage {
  name: string;
  dueDays: number;
}
export interface WorkflowTemplate {
  id: string;
  key: string;
  version: number;
  name: string;
  active: boolean;
  stages: WorkflowTemplateStage[];
}
export interface WorkflowTemplateStore {
  list(organizationId: string): Promise<WorkflowTemplate[]>;
  createVersion(input: {
    organizationId: string;
    actorUserId: string;
    key: string;
    name: string;
    stages: WorkflowTemplateStage[];
    occurredAt: Date;
  }): Promise<WorkflowTemplate>;
  setActive(input: {
    organizationId: string;
    actorUserId: string;
    templateId: string;
    active: boolean;
    reason: string;
    occurredAt: Date;
  }): Promise<boolean>;
}

export class WorkflowTemplateService {
  constructor(
    private readonly store: WorkflowTemplateStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  list(context: AuthorizationContext, organizationId: string) {
    requireAuthorization(context, {
      organizationId,
      permission: "document.review.manage",
    });
    return this.store.list(organizationId);
  }
  createVersion(
    context: AuthorizationContext,
    input: {
      organizationId: string;
      key: string;
      name: string;
      stages: WorkflowTemplateStage[];
    },
  ) {
    requireAuthorization(context, {
      organizationId: input.organizationId,
      permission: "document.review.manage",
    });
    const key = input.key.trim().toLowerCase();
    const name = input.name.trim();
    if (!/^[a-z][a-z0-9_-]{1,49}$/.test(key) || !name)
      throw new WorkflowTemplateValidationError();
    if (
      input.stages.length < 1 ||
      input.stages.length > 10 ||
      input.stages.some(
        (stage) =>
          !stage.name.trim() ||
          !Number.isSafeInteger(stage.dueDays) ||
          stage.dueDays < 1 ||
          stage.dueDays > 365,
      )
    )
      throw new WorkflowTemplateValidationError();
    return this.store.createVersion({
      ...input,
      key,
      name,
      stages: input.stages.map((stage) => ({
        name: stage.name.trim(),
        dueDays: stage.dueDays,
      })),
      actorUserId: context.userId,
      occurredAt: this.clock(),
    });
  }
  async setActive(
    context: AuthorizationContext,
    input: {
      organizationId: string;
      templateId: string;
      active: boolean;
      reason: string;
    },
  ) {
    requireAuthorization(context, {
      organizationId: input.organizationId,
      permission: "document.review.manage",
    });
    if (!input.reason.trim()) throw new WorkflowTemplateValidationError();
    const changed = await this.store.setActive({
      ...input,
      reason: input.reason.trim(),
      actorUserId: context.userId,
      occurredAt: this.clock(),
    });
    if (!changed) throw new WorkflowTemplateConflictError();
  }
}
export class WorkflowTemplateValidationError extends Error {}
export class WorkflowTemplateConflictError extends Error {}
