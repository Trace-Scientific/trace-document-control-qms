// Inert transaction library: no CLI, no Railway service invocation, no credentials.
// This function is not wired to any live execution path. Future use requires
// separately reviewed authorization, role restrictions, and runtime attestation.
export const DEMO_CREATE_CONFIRMATION = "CREATE-INACTIVE-SYNTHETIC-TRACE-DEMO-LAB";
export const DEMO_CREATE_LOGIN_CODE = "trace-demo-lab";

export const ISOLATION_DEMO_CREATE_CONFIRMATION = "CREATE-INACTIVE-SYNTHETIC-TRACE-DEMO-LAB-B";
export const ISOLATION_DEMO_LOGIN_CODE = "trace-demo-lab-b";
export const ISOLATION_DEMO_DISPLAY_NAME = "Trace Scientific Demo Laboratory B (SYNTHETIC)";
export const ISOLATION_DEMO_LEGAL_NAME = "Trace Scientific Demonstration Laboratory B - Fictional";

export function createInactiveSyntheticDemoOrganization(db, { authorization } = {}) {
  return createInactiveOrganization(db, authorization, {
    confirmation: DEMO_CREATE_CONFIRMATION,
    loginCode: DEMO_CREATE_LOGIN_CODE,
    legalName: "Trace Scientific Demonstration Laboratory - Fictional",
    displayName: "Trace Scientific Demo Laboratory (SYNTHETIC)",
  });
}

export function createInactiveIsolationDemoOrganization(db, { authorization } = {}) {
  return createInactiveOrganization(db, authorization, {
    confirmation: ISOLATION_DEMO_CREATE_CONFIRMATION,
    loginCode: ISOLATION_DEMO_LOGIN_CODE,
    legalName: ISOLATION_DEMO_LEGAL_NAME,
    displayName: ISOLATION_DEMO_DISPLAY_NAME,
  });
}

async function createInactiveOrganization(db, authorization, { confirmation, loginCode, legalName, displayName }) {
  if (authorization !== confirmation) {
    throw new Error("Demo create: independent explicit authorization is required");
  }
  if (!db || typeof db.$transaction !== "function") {
    throw new Error("Demo create: transactional database client required");
  }
  return db.$transaction(async (tx) => {
    const existing = await tx.organization.findUnique({
      where: { loginCode },
      select: { id: true },
    });
    if (existing) throw new Error("Demo create: target login code already exists");
    const organization = await tx.organization.create({
      data: {
        loginCode,
        legalName,
        displayName,
        timezone: "America/Los_Angeles",
        active: false,
      },
      select: { id: true, loginCode: true, active: true },
    });
    if (organization.active !== false || organization.loginCode !== loginCode) {
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
          loginCode,
          provisioningVersion: 1,
          initialStatus: "INACTIVE",
        },
      },
    });
    return { organization, auditAction: "DEMO_TENANT_PROVISIONED" };
  });
}
