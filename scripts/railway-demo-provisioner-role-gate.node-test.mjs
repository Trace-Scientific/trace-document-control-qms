import assert from "node:assert/strict";
import test from "node:test";
import { validateDemoProvisionerRole, inspectDemoProvisionerRole } from "./railway-demo-provisioner-role-gate.mjs";

const approved = {
  database_user: "trace_demo_provisioner",
  is_superuser: false, can_create_db: false, can_create_role: false,
  can_replicate: false, bypass_rls: false, transaction_read_only: "on",
  can_insert_organization: false, can_update_organization: false, can_delete_organization: false,
  can_insert_audit: false, can_update_audit: false, can_delete_audit: false,
};
test("accepts the exact restricted read-only provisioner role", async () => {
  let reads = 0;
  const result = await inspectDemoProvisionerRole({
    $queryRaw: async () => { reads++; return [approved]; },
  });
  assert.equal(result.verifiedReadOnly, true);
  assert.equal(result.writesPerformed, 0);
  assert.equal(reads, 1);
});
for (const [name, change] of [
  ["wrong role", { database_user: "postgres" }],
  ["superuser", { is_superuser: true }],
  ["create database", { can_create_db: true }],
  ["create role", { can_create_role: true }],
  ["replication", { can_replicate: true }],
  ["bypass RLS", { bypass_rls: true }],
  ["write-enabled session", { transaction_read_only: "off" }],
  ...["can_insert_organization", "can_update_organization", "can_delete_organization", "can_insert_audit", "can_update_audit", "can_delete_audit"].map((field) => [field, { [field]: true }]),
]) {
  test("rejects " + name, () => assert.throws(
    () => validateDemoProvisionerRole([{ ...approved, ...change }]), /not approved/
  ));
}
test("rejects missing or ambiguous role rows", () => {
  assert.throws(() => validateDemoProvisionerRole([]), /exactly one/);
  assert.throws(() => validateDemoProvisionerRole([approved, approved]), /exactly one/);
});
