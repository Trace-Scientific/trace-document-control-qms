import { DEMO_DOCUMENT_TYPES, DEMO_SITES, DEMO_DEPARTMENTS, validateDemoManifest } from "./demo-tenant-manifest.mjs";

export async function planDemoConfiguration(db, organizationId) {
  validateDemoManifest();
  if (!organizationId) throw new Error("Explicit demo organization ID required");
  const organization = await db.organization.findUnique({ where: { id: organizationId } });
  if (!organization || organization.loginCode !== "trace-demo-lab" || organization.active !== true) {
    throw new Error("Demo configuration refused: organization mismatch or inactive");
  }
  const [sites, departments, types] = await Promise.all([
    db.site.findMany({ where: { organizationId }, select: { name: true } }),
    db.department.findMany({ where: { organizationId }, select: { name: true, siteId: true } }),
    db.documentType.findMany({ where: { organizationId }, select: { code: true } }),
  ]);
  const existingSites = new Set(sites.map((x) => x.name));
  const existingDepartments = new Set(departments.filter((x) => x.siteId === null).map((x) => x.name));
  const existingTypes = new Set(types.map((x) => x.code));
  return {
    organizationId,
    sites: DEMO_SITES.filter((x) => !existingSites.has(x.name)),
    departments: DEMO_DEPARTMENTS.filter((name) => !existingDepartments.has(name)),
    documentTypes: DEMO_DOCUMENT_TYPES.filter((x) => !existingTypes.has(x.code)),
  };
}

export async function configureDemoOrganization(db, organizationId, { apply = false } = {}) {
  const plan = await planDemoConfiguration(db, organizationId);
  if (!apply) return { applied: false, plan };
  // A single transaction prevents partial configuration; unique constraints guard concurrent runs.
  await db.$transaction(async (tx) => {
    const org = await tx.organization.findUnique({ where: { id: organizationId } });
    if (!org || org.loginCode !== "trace-demo-lab" || !org.active) {
      throw new Error("Demo tenant changed before configuration");
    }
    for (const site of plan.sites) {
      await tx.site.create({ data: { organizationId, ...site } });
    }
    for (const name of plan.departments) {
      await tx.department.create({ data: { organizationId, name } });
    }
    for (const type of plan.documentTypes) {
      await tx.documentType.create({ data: { organizationId, ...type } });
    }
    await tx.auditEvent.create({
      data: {
        organizationId,
        action: "DEMO_CONFIGURATION_CREATED",
        entityType: "Organization",
        entityId: organizationId,
        reason: "Synthetic demo catalog configuration",
        metadata: {
          siteCount: plan.sites.length,
          departmentCount: plan.departments.length,
          documentTypeCount: plan.documentTypes.length,
        },
      },
    });
  });
  return { applied: true, plan };
}
