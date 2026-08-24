import type { SessionRecord } from "./session";

export interface TenantContext {
  organizationId: string;
  userId: string;
  sessionId: string;
}

export function deriveTenantContext(
  session: SessionRecord,
  requestedOrganizationId?: string,
): TenantContext {
  if (
    requestedOrganizationId &&
    requestedOrganizationId !== session.organizationId
  ) {
    throw new Error("Access denied");
  }

  return {
    organizationId: session.organizationId,
    userId: session.userId,
    sessionId: session.id,
  };
}
