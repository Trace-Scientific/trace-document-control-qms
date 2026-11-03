import assert from "node:assert/strict";
import test from "node:test";
import { validateDemoCreationSchemaContract as validate } from "./demo-provisioner-schema-contract.mjs";
const make = () => ({
  mode: "READ_ONLY", writesPerformed: 0,
  tables: [
    { table: "Organization", columns: ["id", "loginCode", "legalName", "displayName", "timezone", "active"].map(name => ({ name, definition: name === "id" ? "type=uuid;not_null=t;default=gen_random_uuid()" : "type=text;not_null=t;default=<none>" })),
      constraints: [{ name: "Organization_pkey", definition: "PRIMARY KEY (id)" }, { name: "Organization_loginCode_key", definition: 'UNIQUE ("loginCode")' }] },
    { table: "AuditEvent", columns: ["id", "organizationId", "action", "entityType", "entityId", "metadata", "occurredAt"].map(name => ({ name, definition: name === "id" ? "type=uuid;not_null=t;default=gen_random_uuid()" : name === "metadata" ? "type=jsonb;not_null=t;default='{}'::jsonb" : "type=text;not_null=t;default=<none>" })),
      constraints: [{ name: "AuditEvent_pkey", definition: "PRIMARY KEY (id)" }, { name: "AuditEvent_organizationId_fkey", definition: 'FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON UPDATE CASCADE ON DELETE RESTRICT' }] },
  ],
});
test("accepts complete synthetic provisioning schema contract offline", () => {
  assert.equal(validate(make()).schemaContractPassed, true);
});
test("rejects missing unique login code", () => {
  const report = make(); report.tables[0].constraints.pop();
  assert.throws(() => validate(report), /unique loginCode/);
});
test("rejects missing audit foreign key", () => {
  const report = make(); report.tables[1].constraints.pop();
  assert.throws(() => validate(report), /audit organization foreign key/);
});
test("rejects write-tainted reports", () => {
  const report = make(); report.writesPerformed = 1;
  assert.throws(() => validate(report), /read-only/);
});
test("rejects missing required column", () => {
  const report = make(); report.tables[0].columns.pop();
  assert.throws(() => validate(report), /missing Organization.active/);
});
test("rejects unexpected primary key default", () => {
  const report = make(); report.tables[0].columns[0].definition = "type=uuid;not_null=t;default=<none>";
  assert.throws(() => validate(report), /UUID primary key/);
});
