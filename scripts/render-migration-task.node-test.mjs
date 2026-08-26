import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { renderMigrationTask } from "./render-migration-task.mjs";

const template = fs.readFileSync("deploy/aws/validation/migration-task-definition.json", "utf8");
const values = {
  EXECUTION_ROLE_ARN: "arn:aws:iam::123456789012:role/execution",
  TASK_ROLE_ARN: "arn:aws:iam::123456789012:role/task",
  IMAGE_URI: "123456789012.dkr.ecr.us-west-1.amazonaws.com/trace-qms-migration",
  MIGRATION_IMAGE_DIGEST: `sha256:${"a".repeat(64)}`,
  APP_RELEASE_VERSION: "0.1.0-rc.3",
  APP_RELEASE_SHA: "b".repeat(40),
  DATABASE_URL_SECRET_ARN: "arn:aws:secretsmanager:us-west-1:123456789012:secret:database",
  LOG_GROUP: "/trace-qms/validation/application",
};

test("renders a complete digest-addressed X86_64 task", () => {
  const rendered = renderMigrationTask(template, values);
  assert.doesNotMatch(rendered, /\$\{/);
  assert.match(JSON.parse(rendered).containerDefinitions[0].image, /@sha256:[a-f0-9]{64}$/);
});

test("rejects missing values", () => {
  assert.throws(() => renderMigrationTask(template, { ...values, LOG_GROUP: "" }), /LOG_GROUP/);
});

test("rejects mutable images", () => {
  assert.throws(() => renderMigrationTask(template, { ...values, MIGRATION_IMAGE_DIGEST: "latest" }), /immutable/);
});
