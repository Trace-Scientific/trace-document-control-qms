import assert from "node:assert/strict";
import test from "node:test";
import { validateDemoProvisioningEvidence, DEMO_SQL_TARGET } from "./demo-one-time-sql-contract.mjs";

const valid = () => ({
  existingTenantCount: 0, databaseName: "railway", environment: "demo",
  uniqueLoginCodeIndex: true, auditMutationTrigger: true,
  readOnlyRole: {
    name: "trace_demo_provisioner", defaultReadOnly: true, memberships: 0,
    superuser: false, canCreateSchema: false, canCreateDatabase: false,
    canInsertOrganization: false, canUpdateOrganization: false, canDeleteOrganization: false,
    canInsertAudit: false, canUpdateAudit: false, canDeleteAudit: false,
  },
});
test("review-only contract requires a separate write stage", () => {
  const result = validateDemoProvisioningEvidence(valid());
  assert.equal(result.executable, false);
  assert.equal(result.requiresSeparateWriteStage, true);
  assert.equal(result.expectedNewOrganizations, 1);
  assert.equal(result.expectedNewAuditEvents, 1);
  assert.equal(result.target.active, false);
  assert.equal(DEMO_SQL_TARGET.loginCode, "trace-demo-lab");
});
test("fails closed on missing or unexpected database evidence", () => {
  for (const change of [
    (e) => { e.existingTenantCount = 1; },
    (e) => { e.environment = "production"; },
    (e) => { e.databaseName = "other"; },
    (e) => { e.uniqueLoginCodeIndex = false; },
    (e) => { e.auditMutationTrigger = false; },
    (e) => { e.readOnlyRole.memberships = 1; },
    (e) => { e.readOnlyRole.canInsertOrganization = true; },
    (e) => { e.readOnlyRole.canInsertAudit = true; },
    (e) => { e.readOnlyRole.canCreateSchema = true; },
    (e) => { e.readOnlyRole.defaultReadOnly = false; },
  ]) {
    const evidence = valid(); change(evidence);
    assert.throws(() => validateDemoProvisioningEvidence(evidence));
  }
});
