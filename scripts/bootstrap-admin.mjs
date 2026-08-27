import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const required = ["BOOTSTRAP_ORGANIZATION_CODE", "BOOTSTRAP_ADMIN_EMAIL", "BOOTSTRAP_ADMIN_FIRST_NAME", "BOOTSTRAP_ADMIN_LAST_NAME", "BOOTSTRAP_ADMIN_PASSWORD"];
for (const key of required) if (!process.env[key]) throw new Error(`${key} is required`);
if (process.env.BOOTSTRAP_ADMIN_CONFIRM !== "CREATE-FIRST-ADMIN") throw new Error("BOOTSTRAP_ADMIN_CONFIRM must equal CREATE-FIRST-ADMIN");
if (process.env.BOOTSTRAP_ADMIN_PASSWORD.length < 12) throw new Error("Bootstrap password must contain at least 12 characters");

const permissions = ["document.read", "document.create", "document.submit", "document.review", "document.review.complete", "document.review.manage", "document.approve", "document.make_effective", "document.distribute", "document.acknowledge", "document.delete", "notification.manage"];
const salt = randomBytes(16);
const passwordHash = ["scrypt", 16384, 8, 1, salt.toString("base64url"), scryptSync(process.env.BOOTSTRAP_ADMIN_PASSWORD, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("base64url")].join("$");

try {
  const organization = await db.organization.findUnique({ where: { loginCode: process.env.BOOTSTRAP_ORGANIZATION_CODE } });
  if (!organization?.active) throw new Error("Active organization not found");
  if (await db.credential.count({ where: { organizationId: organization.id } })) throw new Error("Bootstrap refused: this organization already has credentials");
  await db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { organizationId: organization.id, email: process.env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase(), firstName: process.env.BOOTSTRAP_ADMIN_FIRST_NAME, lastName: process.env.BOOTSTRAP_ADMIN_LAST_NAME, status: "ACTIVE" } });
    await tx.credential.create({ data: { organizationId: organization.id, userId: user.id, passwordHash } });
    const role = await tx.role.create({ data: { organizationId: organization.id, name: "System Administrator", description: "Initial controlled administrator", systemRole: true } });
    for (const key of permissions) {
      const permission = await tx.permission.upsert({ where: { key }, update: {}, create: { key } });
      await tx.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    }
    await tx.userRole.create({ data: { organizationId: organization.id, userId: user.id, roleId: role.id, assignedBy: user.id } });
    await tx.auditEvent.create({ data: { organizationId: organization.id, actorUserId: user.id, action: "BOOTSTRAP_ADMIN_CREATED", entityType: "User", entityId: user.id, reason: "Controlled first-administrator bootstrap", metadata: { email: user.email, role: role.name } } });
  });
  console.log("First administrator created. Remove all BOOTSTRAP_ADMIN_* variables now.");
} finally {
  await db.$disconnect();
}
