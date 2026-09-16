import { describe, expect, it } from "vitest";
import {
  evaluatePlatformAuthorization,
  PlatformAuthorizationError,
  requirePlatformAuthorization,
  type PlatformAuthorizationContext,
} from "./authorization";

const activeContext = (grants: PlatformAuthorizationContext["grants"]): PlatformAuthorizationContext => ({
  platformIdentityId: "11111111-1111-4111-8111-111111111111",
  platformMembershipId: "22222222-2222-4222-8222-222222222222",
  identityStatus: "ACTIVE",
  membershipStatus: "ACTIVE",
  grants,
});

describe("platform authorization", () => {
  it("fails closed when the required platform permission is absent", () => {
    expect(
      evaluatePlatformAuthorization(activeContext([]), {
        permission: "platform.organization.read",
      }),
    ).toEqual({ allowed: false, reason: "missing_permission" });
  });

  it("allows only an explicitly granted platform permission", () => {
    const context = activeContext(["platform.organization.read"]);
    expect(
      evaluatePlatformAuthorization(context, { permission: "platform.organization.read" }),
    ).toEqual({ allowed: true });
    expect(
      evaluatePlatformAuthorization(context, { permission: "platform.organization.manage" }),
    ).toEqual({ allowed: false, reason: "missing_permission" });
  });

  it.each(["INACTIVE", "LOCKED", "PENDING"] as const)(
    "denies an %s platform identity",
    (identityStatus) => {
      const context: PlatformAuthorizationContext = {
        ...activeContext(["platform.security.manage"]),
        identityStatus,
      };
      expect(
        evaluatePlatformAuthorization(context, { permission: "platform.security.manage" }),
      ).toEqual({ allowed: false, reason: "identity_inactive" });
    },
  );

  it.each(["INACTIVE", "LOCKED", "PENDING"] as const)(
    "denies an %s platform membership",
    (membershipStatus) => {
      const context: PlatformAuthorizationContext = {
        ...activeContext(["platform.security.manage"]),
        membershipStatus,
      };
      expect(
        evaluatePlatformAuthorization(context, { permission: "platform.security.manage" }),
      ).toEqual({ allowed: false, reason: "membership_inactive" });
    },
  );

  it("throws a platform-specific authorization error rather than a tenant authorization error", () => {
    expect(() =>
      requirePlatformAuthorization(activeContext([]), {
        permission: "platform.audit.read",
      }),
    ).toThrow(PlatformAuthorizationError);
  });

  it("contains no organization identifier or tenant grant shape", () => {
    const context = activeContext(["platform.health.read"]);
    expect("organizationId" in context).toBe(false);
    expect("userId" in context).toBe(false);
  });
});
