export type ScopeType = "ORGANIZATION" | "SITE" | "DEPARTMENT";

export interface RoleGrant {
  permission: string;
  scopeType: ScopeType;
  scopeId: string | null;
}

export interface AuthorizationContext {
  userId: string;
  organizationId: string;
  userState: "INVITED" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  grants: readonly RoleGrant[];
}

export interface AuthorizationRequest {
  organizationId: string;
  permission: string;
  siteId?: string;
  departmentId?: string;
}

export type AuthorizationDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "account_not_active" | "tenant_mismatch" | "permission_missing" | "scope_mismatch";
    };

export function evaluateAuthorization(
  context: AuthorizationContext,
  request: AuthorizationRequest,
): AuthorizationDecision {
  if (context.userState !== "ACTIVE") {
    return { allowed: false, reason: "account_not_active" };
  }
  if (context.organizationId !== request.organizationId) {
    return { allowed: false, reason: "tenant_mismatch" };
  }

  const matching = context.grants.filter((grant) => grant.permission === request.permission);
  if (matching.length === 0) return { allowed: false, reason: "permission_missing" };

  const inScope = matching.some((grant) => {
    if (grant.scopeType === "ORGANIZATION") return grant.scopeId === null;
    if (grant.scopeType === "SITE") return Boolean(request.siteId && grant.scopeId === request.siteId);
    return Boolean(request.departmentId && grant.scopeId === request.departmentId);
  });

  return inScope ? { allowed: true } : { allowed: false, reason: "scope_mismatch" };
}

export function requireAuthorization(
  context: AuthorizationContext,
  request: AuthorizationRequest,
): void {
  if (!evaluateAuthorization(context, request).allowed) {
    throw new Error("Access denied");
  }
}
