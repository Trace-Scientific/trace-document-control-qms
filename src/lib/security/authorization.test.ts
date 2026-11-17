import { describe, expect, it } from "vitest";
import { evaluateAuthorization, requireAuthorization, type AuthorizationContext } from "./authorization";

const context: AuthorizationContext = {
  userId: "user-1",
  organizationId: "org-1",
  userState: "ACTIVE",
  grants: [
    { permission: "document.read", scopeType: "ORGANIZATION", scopeId: null },
    { permission: "document.approve", scopeType: "SITE", scopeId: "site-a" },
  ],
};

const leastPrivilegeReviewer: AuthorizationContext = {
  userId: "uat-reviewer",
  organizationId: "org-1",
  userState: "ACTIVE",
  grants: [
    { permission: "document.read", scopeType: "ORGANIZATION", scopeId: null },
    { permission: "document.review", scopeType: "ORGANIZATION", scopeId: null },
  ],
};

describe("deny-by-default authorization", () => {
  it.each([
    ["document.read", "read"],
    ["document.create", "create"],
    ["document.update", "update"],
    ["document.review", "review"],
    ["document.approve", "approve"],
    ["document.delete", "delete"],
  ])("denies cross-tenant %s in both directions even with an explicit grant", (permission) => {
    const orgA: AuthorizationContext = {
      userId: "user-a",
      organizationId: "org-a",
      userState: "ACTIVE",
      grants: [{ permission, scopeType: "ORGANIZATION", scopeId: null }],
    };
    const orgB: AuthorizationContext = {
      userId: "user-b",
      organizationId: "org-b",
      userState: "ACTIVE",
      grants: [{ permission, scopeType: "ORGANIZATION", scopeId: null }],
    };

    expect(evaluateAuthorization(orgA, { organizationId: "org-a", permission })).toEqual({
      allowed: true,
    });
    expect(evaluateAuthorization(orgB, { organizationId: "org-b", permission })).toEqual({
      allowed: true,
    });
    expect(evaluateAuthorization(orgA, { organizationId: "org-b", permission })).toEqual({
      allowed: false,
      reason: "tenant_mismatch",
    });
    expect(evaluateAuthorization(orgB, { organizationId: "org-a", permission })).toEqual({
      allowed: false,
      reason: "tenant_mismatch",
    });
    expect(() => requireAuthorization(orgA, { organizationId: "org-b", permission })).toThrow(
      "Access denied",
    );
    expect(() => requireAuthorization(orgB, { organizationId: "org-a", permission })).toThrow(
      "Access denied",
    );
  });

  it.each(["INVITED", "SUSPENDED", "DEACTIVATED"] as const)(
    "denies %s users even when they hold an organization-wide grant",
    (userState) => {
      const inactive: AuthorizationContext = {
        ...context,
        userState,
      };
      expect(evaluateAuthorization(inactive, {
        organizationId: "org-1",
        permission: "document.read",
      })).toEqual({ allowed: false, reason: "account_not_active" });
      expect(() => requireAuthorization(inactive, {
        organizationId: "org-1",
        permission: "document.read",
      })).toThrow("Access denied");
    },
  );

  it("allows an explicitly granted organization permission", () => {
    expect(evaluateAuthorization(context, {
      organizationId: "org-1",
      permission: "document.read",
    })).toEqual({ allowed: true });
  });

  it("denies cross-tenant access before evaluating grants", () => {
    expect(evaluateAuthorization(context, {
      organizationId: "org-2",
      permission: "document.read",
    })).toEqual({ allowed: false, reason: "tenant_mismatch" });
  });

  it("denies missing permissions and mismatched scopes", () => {
    expect(evaluateAuthorization(context, {
      organizationId: "org-1",
      permission: "document.delete",
    })).toEqual({ allowed: false, reason: "permission_missing" });
    expect(evaluateAuthorization(context, {
      organizationId: "org-1",
      permission: "document.approve",
      siteId: "site-b",
    })).toEqual({ allowed: false, reason: "scope_mismatch" });
  });

  it("denies administration access to a document read/review user", () => {
    expect(evaluateAuthorization(leastPrivilegeReviewer, {
      organizationId: "org-1",
      permission: "administration.manage",
    })).toEqual({ allowed: false, reason: "permission_missing" });
    expect(() => requireAuthorization(leastPrivilegeReviewer, {
      organizationId: "org-1",
      permission: "administration.manage",
    })).toThrow("Access denied");
  });

  it("does not leak denial details through the enforcing boundary", () => {
    expect(() => requireAuthorization(context, {
      organizationId: "org-2",
      permission: "document.read",
    })).toThrow("Access denied");
  });
});
