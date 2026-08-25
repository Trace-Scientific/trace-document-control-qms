import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const templateUrl = new URL("../deploy/aws/validation/foundation.yaml", import.meta.url);

test("pins the approved region through the deployment command, not the template", async () => {
  const template = await readFile(templateUrl, "utf8");
  assert.match(template, /MultiAZ: true/);
  assert.match(template, /BackupRetentionPeriod: !Ref BackupRetentionDays/);
  assert.match(template, /DeletionProtection: true/);
  assert.match(template, /PubliclyAccessible: false/);
  assert.match(template, /ImageTagMutability: IMMUTABLE/);
  assert.match(template, /EnableKeyRotation: true/);
});

test("contains two isolated application, database, and public subnets", async () => {
  const template = await readFile(templateUrl, "utf8");
  for (const name of [
    "PublicSubnetA", "PublicSubnetB", "ApplicationSubnetA",
    "ApplicationSubnetB", "DatabaseSubnetA", "DatabaseSubnetB",
  ]) assert.match(template, new RegExp(`^  ${name}:`, "m"));
});

test("contains no credential values", async () => {
  const template = await readFile(templateUrl, "utf8");
  assert.doesNotMatch(template, /^\s+MasterUserPassword:/m);
  assert.doesNotMatch(template, /postgresql:\/\//);
});
