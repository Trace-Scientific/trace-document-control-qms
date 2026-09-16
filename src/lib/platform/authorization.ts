import type { PlatformPermissionKey } from "./permissions";

export type PlatformPrincipalStatus = "ACTIVE" | "INACTIVE" | "LOCKED" | "PENDING";

export interface PlatformAuthorizationContext {
  platformIdentityId: string;
  platformMembershipId: string;
  identityStatus: PlatformPrincipalStatus;
  membershipStatus: PlatformPrincipalStatus;
  grants: readonly PlatformPermissionKey[];
}

export interface PlatformAuthorizationRequest {
  permission: PlatformPermissionKey;
}

export interface PlatformAuthorizationDecision {
  allowed: boolean;
  reason?: "identity_inactive" | "membership_inactive" | "missing_permission";
}

export function evaluatePlatformAuthorization(
  context: PlatformAuthorizationContext,
  request: PlatformAuthorizationRequest,
): PlatformAuthorizationDecision {
  if (context.identityStatus !== "ACTIVE") {
    return { allowed: false, reason: "identity_inactive" };
  }
  if (context.membershipStatus !== "ACTIVE") {
    return { allowed: false, reason: "membership_inactive" };
  }
  if (!context.grants.includes(request.permission)) {
    return { allowed: false, reason: "missing_permission" };
  }
  return { allowed: true };
}

export function requirePlatformAuthorization(
  context: PlatformAuthorizationContext,
  request: PlatformAuthorizationRequest,
): void {
  const decision = evaluatePlatformAuthorization(context, request);
  if (!decision.allowed) {
    throw new PlatformAuthorizationError(decision.reason ?? "missing_permission");
  }
}

export class PlatformAuthorizationError extends Error {
  constructor(
    public readonly reason: NonNullable<PlatformAuthorizationDecision["reason"]>,
  ) {
    super(`Platform access denied: ${reason}`);
    this.name = "PlatformAuthorizationError";
  }
}
