import { db } from "../db";
import { requireAuthorization, type AuthorizationContext } from "../security/authorization";
import type { ReceiptLocations } from "./receipt-locations";

export async function listReceiptLocations(context: AuthorizationContext): Promise<ReceiptLocations> {
  const { organizationId } = context;
  requireAuthorization(context, { organizationId, permission: "inventory.read" });
  const [sites, departments] = await Promise.all([
    db.site.findMany({ where: { organizationId }, select: { id: true, name: true, active: true },
      orderBy: [{ name: "asc" }, { id: "asc" }] }),
    db.department.findMany({ where: { organizationId }, select: { id: true, name: true, siteId: true, active: true },
      orderBy: [{ name: "asc" }, { id: "asc" }] }),
  ]);
  return { sites, departments };
}
