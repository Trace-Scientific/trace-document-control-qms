import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const required = ["PLATFORM_BOOTSTRAP_USER_EMAIL", "PLATFORM_BOOTSTRAP_CONFIRM"];
for (const key of required) if (!process.env[key]) throw new Error(`${key} is required`);
if (process.env.PLATFORM_BOOTSTRAP_CONFIRM !== "PROVISION-PLATFORM-ADMIN") {
  throw new Error("PLATFORM_BOOTSTRAP_CONFIRM must equal PROVISION-PLATFORM-ADMIN");
}

const email = process.env.PLATFORM_BOOTSTRAP_USER_EMAIL.trim().toLowerCase();
if (!email) throw new Error("PLATFORM_BOOTSTRAP_USER_EMAIL must not be empty");

const permissionKeys = [
  "platform.organization.read",
  "platform.organization.manage",
  "platform.organization.suspend",
  "platform.subscription.read",
  "platform.subscription.manage",
  "platform.entitlement.manage",
  "platform.support.request",
  "platform.support.approve",
  "platform.support.access",
  "platform.sales.read",
  "platform.sales.manage",
  "platform.commission.read",
  "platform.commission.manage",
  "platform.audit.read",
  "platform.help.manage",
  "platform.health.read",
  "platform.integration.manage",
  "platform.security.manage",
];

try {
  const result = await db.$transaction(async (tx) => {
    const users = await tx.$queryRaw`
      SELECT "id", "email" FROM "User" WHERE lower("email") = ${email} LIMIT 2
    `;
    if (users.length !== 1) throw new Error("Exactly one existing tenant user must match PLATFORM_BOOTSTRAP_USER_EMAIL");

    const user = users[0];
    const identities = await tx.$queryRaw`
      INSERT INTO "PlatformIdentity" ("id", "sourceUserId", "status", "updatedAt")
      VALUES (gen_random_uuid(), ${user.id}::uuid, 'ACTIVE', CURRENT_TIMESTAMP)
      ON CONFLICT ("sourceUserId")
      DO UPDATE SET "status" = 'ACTIVE', "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "id"
    `;
    const identityId = identities[0].id;

    const memberships = await tx.$queryRaw`
      INSERT INTO "PlatformMembership" ("id", "identityId", "status", "updatedAt")
      VALUES (gen_random_uuid(), ${identityId}::uuid, 'ACTIVE', CURRENT_TIMESTAMP)
      ON CONFLICT ("identityId")
      DO UPDATE SET "status" = 'ACTIVE', "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "id"
    `;
    const membershipId = memberships[0].id;

    const roles = await tx.$queryRaw`
      INSERT INTO "PlatformRole" ("id", "name", "description", "systemRole", "updatedAt")
      VALUES (
        gen_random_uuid(),
        'Platform Administrator',
        'Controlled Trace platform administrator role for validation and platform operations.',
        true,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("name")
      DO UPDATE SET "description" = EXCLUDED."description", "systemRole" = true, "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "id"
    `;
    const roleId = roles[0].id;

    const permissions = await tx.$queryRaw`
      SELECT "id", "key" FROM "PlatformPermission"
      WHERE "key" = ANY(${permissionKeys}::text[])
    `;
    if (permissions.length !== permissionKeys.length) {
      const found = new Set(permissions.map((permission) => permission.key));
      const missing = permissionKeys.filter((key) => !found.has(key));
      throw new Error(`Missing platform permissions: ${missing.join(", ")}`);
    }

    for (const permission of permissions) {
      await tx.$executeRaw`
        INSERT INTO "PlatformRolePermission" ("roleId", "permissionId")
        VALUES (${roleId}::uuid, ${permission.id}::uuid)
        ON CONFLICT ("roleId", "permissionId") DO NOTHING
      `;
    }

    const assignments = await tx.$queryRaw`
      INSERT INTO "PlatformMembershipRole" ("membershipId", "roleId", "assignedByMembershipId")
      VALUES (${membershipId}::uuid, ${roleId}::uuid, ${membershipId}::uuid)
      ON CONFLICT ("membershipId", "roleId") DO NOTHING
      RETURNING "membershipId"
    `;

    await tx.$executeRaw`
      INSERT INTO "PlatformAuditEvent" (
        "id", "actorIdentityId", "actorMembershipId", "action", "entityType", "entityId", "reason", "metadata"
      ) VALUES (
        gen_random_uuid(),
        ${identityId}::uuid,
        ${membershipId}::uuid,
        ${assignments.length === 1 ? "platform.admin.bootstrap_provisioned" : "platform.admin.bootstrap_verified"},
        'PlatformMembership',
        ${membershipId}::uuid,
        'Controlled platform administrator bootstrap',
        ${JSON.stringify({ sourceUserEmail: email, role: "Platform Administrator", permissionKeys, idempotent: true })}::jsonb
      )
    `;

    return { email: user.email, identityId, membershipId, roleId, assignmentCreated: assignments.length === 1 };
  });

  console.log(JSON.stringify({
    ok: true,
    email: result.email,
    platformIdentityId: result.identityId,
    platformMembershipId: result.membershipId,
    roleId: result.roleId,
    assignmentCreated: result.assignmentCreated,
  }));
  console.log("Platform administrator bootstrap complete. Remove PLATFORM_BOOTSTRAP_* variables after the controlled run.");
} finally {
  await db.$disconnect();
}
