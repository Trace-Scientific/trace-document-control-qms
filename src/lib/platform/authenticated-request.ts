import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { authenticateRequest } from "../security/authenticated-request";
import type { PlatformAuthorizationContext, PlatformPrincipalStatus } from "./authorization";
import type { PlatformPermissionKey } from "./permissions";

interface PlatformPrincipalRow {
  platformIdentityId: string;
  platformMembershipId: string;
  identityStatus: PlatformPrincipalStatus;
  membershipStatus: PlatformPrincipalStatus;
}

interface PlatformGrantRow {
  permissionKey: PlatformPermissionKey;
}

export async function authenticatePlatformRequest(
  request: NextRequest,
): Promise<PlatformAuthorizationContext> {
  // Reuse tenant authentication only to establish the authenticated human actor.
  // Tenant organization and tenant grants are intentionally not copied into the
  // platform authorization context.
  const tenantActor = await authenticateRequest(request);

  const principals = await db.$queryRaw<PlatformPrincipalRow[]>(Prisma.sql`
    SELECT
      pi."id" AS "platformIdentityId",
      pm."id" AS "platformMembershipId",
      pi."status"::text AS "identityStatus",
      pm."status"::text AS "membershipStatus"
    FROM "PlatformIdentity" pi
    INNER JOIN "PlatformMembership" pm ON pm."identityId" = pi."id"
    WHERE pi."sourceUserId" = ${tenantActor.userId}::uuid
    LIMIT 2
  `);

  if (principals.length !== 1) {
    throw new PlatformAuthenticationRequiredError();
  }

  const principal = principals[0];
  if (principal.identityStatus !== "ACTIVE" || principal.membershipStatus !== "ACTIVE") {
    throw new PlatformAuthenticationRequiredError();
  }

  const grants = await db.$queryRaw<PlatformGrantRow[]>(Prisma.sql`
    SELECT DISTINCT pp."key" AS "permissionKey"
    FROM "PlatformMembershipRole" pmr
    INNER JOIN "PlatformRolePermission" prp ON prp."roleId" = pmr."roleId"
    INNER JOIN "PlatformPermission" pp ON pp."id" = prp."permissionId"
    WHERE pmr."membershipId" = ${principal.platformMembershipId}::uuid
    ORDER BY pp."key"
  `);

  return {
    platformIdentityId: principal.platformIdentityId,
    platformMembershipId: principal.platformMembershipId,
    identityStatus: principal.identityStatus,
    membershipStatus: principal.membershipStatus,
    grants: grants.map((grant) => grant.permissionKey),
  };
}

export class PlatformAuthenticationRequiredError extends Error {
  constructor() {
    super("Platform authentication required");
    this.name = "PlatformAuthenticationRequiredError";
  }
}
