import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "administration.manage" });
    const [organization, sites, departments, users, roles, permissions, documentTypes] = await Promise.all([
      db.organization.findUniqueOrThrow({ where: { id: context.organizationId }, select: { displayName: true, loginCode: true } }),
      db.site.findMany({ where: { organizationId: context.organizationId }, orderBy: { name: "asc" } }),
      db.department.findMany({ where: { organizationId: context.organizationId }, orderBy: { name: "asc" } }),
      db.user.findMany({ where: { organizationId: context.organizationId }, select: { id: true, email: true, firstName: true, lastName: true, status: true, roles: { select: { roleId: true } } }, orderBy: { email: "asc" } }),
      db.role.findMany({ where: { organizationId: context.organizationId }, select: { id: true, name: true, systemRole: true, permissions: { select: { permission: { select: { key: true } } } } }, orderBy: { name: "asc" } }),
      db.permission.findMany({ select: { key: true, description: true }, orderBy: { key: "asc" } }),
      db.documentType.findMany({ where: { organizationId: context.organizationId }, select: { id: true, code: true, name: true, reviewMonths: true, active: true }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    ]);
    return NextResponse.json({ data: { organization, sites, departments, users, roles, permissions, documentTypes } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json({ error: "Unable to load administration" }, { status: 500 });
  }
}
