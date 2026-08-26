import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(".github/workflows/aws-validation-release.yml", "utf8");

test("release is manual, protected, and uses short-lived OIDC", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+(push|pull_request|schedule):/);
  assert.match(workflow, /environment: validation/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /role-to-assume:/);
  assert.doesNotMatch(workflow, /AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY/);
});

test("third-party actions are pinned to immutable commit SHAs", () => {
  const uses = [...workflow.matchAll(/uses:\s*([^\s]+)/g)].map((match) => match[1]);
  assert.ok(uses.length >= 4);
  for (const action of uses) assert.match(action, /@[0-9a-f]{40}$/);
});

test("plan publishes amd64 images and creates but does not execute a change set", () => {
  assert.match(workflow, /inputs\.operation == 'plan'/);
  assert.match(workflow, /--platform linux\/amd64/g);
  assert.match(workflow, /--no-execute-changeset/);
  assert.match(workflow, /application_image_digest=/);
  assert.match(workflow, /migration_image_digest=/);
});

test("apply verifies the plan and migration before activation", () => {
  assert.match(workflow, /inputs\.operation == 'apply'/);
  assert.match(workflow, /CREATE_COMPLETE/);
  assert.match(workflow, /ChangeSetType --output text\)" = UPDATE/);
  assert.match(workflow, /tasks-stopped/);
  const exitCheck = workflow.indexOf('test "$exit_code" = 0');
  const execute = workflow.indexOf("execute-change-set");
  assert.ok(exitCheck > 0 && execute > exitCheck);
  assert.match(workflow, /assignPublicIp=DISABLED/);
});

test("workflow is fixed to the approved California region and hostname", () => {
  assert.match(workflow, /AWS_REGION: us-west-1/);
  assert.match(workflow, /DomainName=traceqms\.com/);
});
