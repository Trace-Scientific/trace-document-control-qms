import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";
import { hashPassword } from "@/lib/security/crypto";

const uuid = z.string().uuid();
const documentTypeCode = z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/).transform((value) => value.toUpperCase());
const schema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("UPDATE_ORGANIZATION"), displayName: z.string().trim().min(2).max(120) }),
  z.object({ operation: z.literal("CREATE_SITE"), name: z.string().trim().min(2).max(120) }),
  z.object({ operation: z.literal("CREATE_DEPARTMENT"), name: z.string().trim().min(2).max(120), siteId: uuid.nullable() }),
  z.object({ operation: z.literal("CREATE_USER"), email: z.string().trim().toLowerCase().email().max(254), firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), temporaryPassword: z.string().min(12).max(1024) }),
  z.object({ operation: z.literal("CREATE_ROLE"), name: z.string().trim().min(2).max(100), permissionKeys: z.array(z.string().min(1)).min(1).max(100) }),
  z.object({ operation: z.literal("ASSIGN_ROLE"), userId: uuid, roleId: uuid }),
  z.object({ operation: z.literal("CREATE_DOCUMENT_TYPE"), code: documentTypeCode, name: z.string().trim().min(2).max(120), reviewMonths: z.number().int().min(1).max(120).nullable() }),
  z.object({ operation: z.literal("SET_DOCUMENT_TYPE_ACTIVE"), documentTypeId: uuid, active: z.boolean() }),
]);

export async function POST(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "administration.manage" });
    const input = schema.parse(await request.json());
    const result = await db.$transaction(async (tx) => {
      let entityType = "Organization", entityId = context.organizationId;
      let metadata: Record<string, unknown> = { operation: input.operation };
      if (input.operation === "UPDATE_ORGANIZATION") {
        await tx.organization.update({ where: { id: context.organizationId }, data: { displayName: input.displayName } }); metadata = { ...metadata, displayName: input.displayName };
      } else if (input.operation === "CREATE_SITE") {
        const row = await tx.site.create({ data: { organizationId: context.organizationId, name: input.name } }); entityType = "Site"; entityId = row.id; metadata = { ...metadata, name: row.name };
      } else if (input.operation === "CREATE_DEPARTMENT") {
        if (input.siteId && !await tx.site.findFirst({ where: { id: input.siteId, organizationId: context.organizationId } })) throw new Error("Access denied");
        const row = await tx.department.create({ data: { organizationId: context.organizationId, name: input.name, siteId: input.siteId } }); entityType = "Department"; entityId = row.id; metadata = { ...metadata, name: row.name };
      } else if (input.operation === "CREATE_USER") {
        const row = await tx.user.create({ data: { organizationId: context.organizationId, email: input.email, firstName: input.firstName, lastName: input.lastName, status: "ACTIVE" } });
        await tx.credential.create({ data: { organizationId: context.organizationId, userId: row.id, passwordHash: hashPassword(input.temporaryPassword) } }); entityType = "User"; entityId = row.id; metadata = { ...metadata, email: row.email };
      } else if (input.operation === "CREATE_ROLE") {
        const allowed = await tx.permission.findMany({ where: { key: { in: input.permissionKeys } }, select: { id: true, key: true } });
        if (allowed.length !== new Set(input.permissionKeys).size) throw new Error("Unknown permission");
        const row = await tx.role.create({ data: { organizationId: context.organizationId, name: input.name, permissions: { create: allowed.map((permission) => ({ permissionId: permission.id })) } } }); entityType = "Role"; entityId = row.id; metadata = { ...metadata, name: row.name, permissions: allowed.map((permission) => permission.key).sort() };
      } else if (input.operation === "ASSIGN_ROLE") {
        const [user, role] = await Promise.all([tx.user.findFirst({ where: { id: input.userId, organizationId: context.organizationId } }), tx.role.findFirst({ where: { id: input.roleId, organizationId: context.organizationId } })]);
        if (!user || !role) throw new Error("Access denied");
        await tx.userRole.upsert({ where: { organizationId_userId_roleId: { organizationId: context.organizationId, userId: user.id, roleId: role.id } }, update: {}, create: { organizationId: context.organizationId, userId: user.id, roleId: role.id, assignedBy: context.userId } }); entityType = "UserRole"; entityId = user.id; metadata = { ...metadata, roleId: role.id };
      } else if (input.operation === "CREATE_DOCUMENT_TYPE") {
        const duplicate = await tx.documentType.findFirst({ where: { organizationId: context.organizationId, OR: [{ code: input.code }, { name: { equals: input.name, mode: "insensitive" } }] }, select: { id: true } });
        if (duplicate) throw new Error("Document type already exists");
        const row = await tx.documentType.create({ data: { organizationId: context.organizationId, code: input.code, name: input.name, reviewMonths: input.reviewMonths, active: true } });
        entityType = "DocumentType"; entityId = row.id; metadata = { ...metadata, code: row.code, name: row.name, reviewMonths: row.reviewMonths, active: row.active };
      } else {
        const row = await tx.documentType.findFirst({ where: { id: input.documentTypeId, organizationId: context.organizationId } });
        if (!row) throw new Error("Access denied");
        const updated = await tx.documentType.update({ where: { id: row.id }, data: { active: input.active } });
        entityType = "DocumentType"; entityId = updated.id; metadata = { ...metadata, code: updated.code, name: updated.name, active: updated.active };
      }
      await tx.auditEvent.create({ data: { organizationId: context.organizationId, actorUserId: context.userId, action: input.operation, entityType, entityId, metadata: metadata as Prisma.InputJsonValue } });
      return { entityType, entityId };
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid administration request" }, { status: 400 });
    if (error instanceof Error && error.message === "Document type already exists") return NextResponse.json({ error: "A document type with that code or name already exists." }, { status: 409 });
    return NextResponse.json({ error: "Administration change could not be completed" }, { status: 409 });
  }
}
