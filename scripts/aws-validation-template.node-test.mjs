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
  assert.match(template, /Service: logs\.us-west-1\.amazonaws\.com/);
  assert.match(template, /Service: \[sns\.amazonaws\.com, cloudwatch\.amazonaws\.com\]/);
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

test("bootstraps migration-safe ECS resources before the service stack", async () => {
  const template = await readFile(templateUrl, "utf8");
  assert.match(template, /^  Cluster:\n    Type: AWS::ECS::Cluster/m);
  assert.match(template, /^  ApplicationLogGroup:\n    Type: AWS::Logs::LogGroup/m);
  assert.match(template, /RetentionInDays: 365/);
  for (const role of ["ApplicationExecutionRole", "ApplicationTaskRole", "MigrationExecutionRole", "MigrationTaskRole"]) {
    assert.match(template, new RegExp(`^  ${role}:\\n    Type: AWS::IAM::Role`, "m"));
  }
  assert.match(template, /secret:trace-qms\/validation\/database-\*/);
  assert.match(template, /secret:trace-qms\/validation\/cron-\*/);
  for (const output of ["ClusterName", "ApplicationLogGroupName", "ApplicationExecutionRoleArn", "ApplicationTaskRoleArn", "MigrationExecutionRoleArn", "MigrationTaskRoleArn"]) {
    assert.match(template, new RegExp(`^  ${output}:`, "m"));
  }
});
