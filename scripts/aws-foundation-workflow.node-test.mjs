import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(".github/workflows/aws-validation-foundation.yml", "utf8");
const foundation = fs.readFileSync("deploy/aws/validation/foundation.yaml", "utf8");

test("foundation release is manual, protected, and OIDC-only", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+(push|pull_request|schedule):/);
  assert.match(workflow, /environment: validation-foundation/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /role-to-assume:/);
  assert.match(workflow, /EXPECTED_AWS_ACCOUNT_ID:.*AWS_VALIDATION_ACCOUNT_ID/);
  assert.match(workflow, /sts get-caller-identity/);
  assert.doesNotMatch(workflow, /AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY/);
});

test("third-party actions are pinned by full commit SHA", () => {
  const uses = [...workflow.matchAll(/uses:\s*([^\s]+)/g)].map((match) => match[1]);
  assert.equal(uses.length, 3);
  for (const action of uses) assert.match(action, /@[0-9a-f]{40}$/);
});

test("cost review and immutable source are recorded in the change set", () => {
  assert.match(workflow, /test "\$COST_ACKNOWLEDGED" = true/);
  for (const parameter of ["FoundationSourceSha", "ChangeReference", "CostReviewReference"]) {
    assert.match(workflow, new RegExp(`${parameter}=`));
    assert.match(workflow, new RegExp(`planned_parameter ${parameter}`));
    assert.match(foundation, new RegExp(`^  ${parameter}:`, "m"));
  }
});

test("plan cannot execute and apply verifies the approved change set", () => {
  assert.match(workflow, /inputs\.operation == 'plan'/);
  assert.match(workflow, /--no-execute-changeset/);
  assert.match(workflow, /inputs\.operation == 'apply'/);
  assert.match(workflow, /Status --output text\)" = CREATE_COMPLETE/);
  assert.match(workflow, /\^\(CREATE\|UPDATE\)\$/);
  const sourceCheck = workflow.indexOf("planned_parameter FoundationSourceSha");
  const templateCheck = workflow.indexOf("cmp --silent deploy/aws/validation/foundation.yaml");
  const execute = workflow.indexOf("execute-change-set");
  assert.ok(sourceCheck > 0 && templateCheck > sourceCheck && execute > templateCheck);
  assert.match(workflow, /get-template/);
  assert.match(workflow, /stack-create-complete/);
  assert.match(workflow, /stack-update-complete/);
  assert.doesNotMatch(workflow, /--disable-rollback/);
});

test("foundation size and retention choices are constrained", () => {
  assert.match(workflow, /AWS_REGION: us-west-1/);
  assert.match(foundation, /AllowedValues: \[db\.m7g\.large, db\.m7g\.xlarge\]/);
  assert.match(foundation, /AllowedValues: \[100, 200, 500\]/);
  assert.match(foundation, /AllowedValues: \[35\]/);
});
