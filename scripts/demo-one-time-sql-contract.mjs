// Pure offline SQL contract builder. NO database client, CLI, or execution path.
// The output is review material only; never deploy or run without a separately
// approved, tested, least-privilege SECURITY DEFINER implementation.
export const DEMO_SQL_TARGET = Object.freeze({
  loginCode: "trace-demo-lab",
  legalName: "Trace Scientific Demonstration Laboratory - Fictional",
  displayName: "Trace Scientific Demo Laboratory (SYNTHETIC)",
  timezone: "America/Los_Angeles",
  active: false,
  auditAction: "DEMO_TENANT_PROVISIONED",
});

export function validateDemoProvisioningEvidence(evidence) {
  if (!evidence || typeof evidence !== "object") throw new Error("Missing evidence");
  if (evidence.existingTenantCount !== 0) throw new Error("Target must not exist");
  if (evidence.databaseName !== "railway" || evidence.environment !== "demo") {
    throw new Error("Wrong database or environment");
  }
  if (evidence.uniqueLoginCodeIndex !== true || evidence.auditMutationTrigger !== true) {
    throw new Error("Missing required database protections");
  }
  const role = evidence.readOnlyRole;
  if (!role || role.name !== "trace_demo_provisioner" || role.defaultReadOnly !== true ||
      role.memberships !== 0 || role.superuser !== false || role.canCreateSchema !== false ||
      role.canCreateDatabase !== false || role.canInsertOrganization !== false ||
      role.canUpdateOrganization !== false || role.canDeleteOrganization !== false ||
      role.canInsertAudit !== false || role.canUpdateAudit !== false ||
      role.canDeleteAudit !== false) {
    throw new Error("Read-only provisioner boundary failed");
  }
  return Object.freeze({
    target: DEMO_SQL_TARGET,
    expectedNewOrganizations: 1,
    expectedNewAuditEvents: 1,
    executable: false,
    requiresSeparateWriteStage: true,
  });
}
