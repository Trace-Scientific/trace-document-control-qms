import assert from "node:assert/strict";
import test from "node:test";
import { validateDemoLoginCodeIndexes as validate, inspectDemoLoginCodeIndexes as inspect } from "./railway-demo-login-code-indexes.mjs";
const good = () => ({
 index_name: "Organization_loginCode_idx", index_definition: 'CREATE UNIQUE INDEX "Organization_loginCode_idx" ON public."Organization" USING btree ("loginCode")',
 is_unique: true, is_valid: true, is_ready: true, is_partial: false,
 is_expression: false, is_single_key: true, key_column: '"loginCode"',
});
test("recognizes a valid single-key unique login code index", () => {
 assert.equal(validate([good()]).loginCodeUniquenessVerified, true);
});
for (const field of ["is_unique","is_valid","is_ready","is_single_key"]) {
 test("rejects index lacking " + field, () => {
  assert.equal(validate([{...good(),[field]:false}]).loginCodeUniquenessVerified,false);
 });
}
for (const field of ["is_partial","is_expression"]) {
 test("rejects unsafe index with " + field, () => {
  assert.equal(validate([{...good(),[field]:true}]).loginCodeUniquenessVerified,false);
 });
}
test("rejects unrelated index and missing index", () => {
 assert.equal(validate([{...good(),key_column:"id"}]).loginCodeUniquenessVerified,false);
 assert.equal(validate([]).loginCodeUniquenessVerified,false);
});
test("fails closed on malformed and duplicate rows", () => {
 assert.throws(()=>validate([{...good(),is_unique:null}]),/malformed/);
 assert.throws(()=>validate([good(),good()]),/duplicate/);
});
test("uses only a catalog query and returns no writes",async()=>{
 let calls=0; const r=await inspect({$queryRaw:async()=>{calls++;return [good()]}});
 assert.equal(calls,1);assert.equal(r.writesPerformed,0);
});
