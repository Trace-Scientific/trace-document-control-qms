// Inert transaction library: no CLI, no Railway service invocation, no credentials.
// This function is not wired to any live execution path. Future use requires
// separately reviewed authorization, role restrictions, and runtime attestation.
export const DEMO_CREATE_CONFIRMATION = "CREATE-INACTIVE-SYNTHETIC-TRACE-DEMO-LAB";
export const DEMO_CREATE_LOGIN_CODE = "trace-demo-lab";

export async function createInactiveSyntheticDemoOrganization(db, { authorization } = {}) {
  if (authorization !== DEMO_CREATE_CONFIRMATION) {
    throw new Error("Demo create: independent explicit authorization is required");
  }
  if (!db || typeof db.$transaction !== "function") {
    throw new Error("Demo create: transactional database client required");
  }
  return db.$transaction(async (tx) => {
    const existing = await tx.organization.findUnique({
      where: { loginCode: DEMO_CREATE_LOGIN_CODE },
      select: { id: true },
    });
    if (existing) throw new Error("Demo create: target login code already exists");
    const organization = await tx.organization.create({
      data: {
        loginCode: DEMO_CREATE_LOGIN_CODE,
        legalName: "Trace Scientific Demonstration Laboratory - Fictional",
        displayName: "Trace Scientific Demo Laboratory (SYNTHETIC)",
        timezone: "America/Los_Angeles",
        active: false,
      },
      select: { id: true, loginCode: true, active: true },
    });
    if (organization.active !== false || organization.loginCode !== DEMO_CREATE_LOGIN_CODE) {
      throw new Error("Demo create: returned organization violates inactive synthetic constraints");
    }
    await tx.auditEvent.create({
      data: {
        organizationId: organization.id,
        action: "DEMO_TENANT_PROVISIONED",
        entityType: "Organization",
        entityId: organization.id,
        reason: "Synthetic demonstration environment provisioning",
        metadata: {
          synthetic: true,
          loginCode: DEMO_CREATE_LOGIN_CODE,
          provisioningVersion: 1,
          initialStatus: "INACTIVE",
        },
      },
    });
    return { organization, auditAction: "DEMO_TENANT_PROVISIONED" };
  });
}
