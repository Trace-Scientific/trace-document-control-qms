import test from "node:test";
import assert from "node:assert/strict";
import { inspectDemoProvisioningStructure, validateDemoProvisioningStructure } from "./railway-demo-provisioning-structure.mjs";
const rows = [
 {table_name:"Organization",kind:"column",name:"id",definition:"type=uuid;not_null=true;default=<none>"},
 {table_name:"Organization",kind:"constraint",name:"Organization_pkey",definition:"PRIMARY KEY (id)"},
 {table_name:"AuditEvent",kind:"column",name:"id",definition:"type=uuid;not_null=true;default=<none>"},
 {table_name:"AuditEvent",kind:"constraint",name:"AuditEvent_pkey",definition:"PRIMARY KEY (id)"}
];
test("returns read-only structural evidence", async () => {
 const result=await inspectDemoProvisioningStructure({$queryRaw:async()=>rows});
 assert.equal(result.writesPerformed,0);
 assert.equal(result.tables.length,2);
});
test("fails closed on missing constraints",()=>assert.throws(()=>validateDemoProvisioningStructure(rows.slice(0,3)),/incomplete/));
test("fails closed on unexpected tables",()=>assert.throws(()=>validateDemoProvisioningStructure([...rows,{...rows[0],table_name:"Users"}]),/unexpected/));
test("fails closed on duplicates",()=>assert.throws(()=>validateDemoProvisioningStructure([...rows,rows[0]]),/duplicate/));
test("requires database client",async()=>await assert.rejects(inspectDemoProvisioningStructure(null),/client required/));
