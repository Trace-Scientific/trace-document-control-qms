import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runbook = await readFile(
  "docs/operations/salesforce-cdc-railway-activation-readiness.md",
  "utf8",
);
const checklist = await readFile(
  "docs/operations/salesforce-cdc-railway-activation-checklist.md",
  "utf8",
);
const dockerfile = await readFile("Dockerfile.preview", "utf8");
const packageJson = JSON.parse(await readFile("package.json", "utf8"));

test("Salesforce CDC Railway readiness defines an inert one-shot worker service", () => {
  assert.match(runbook, /salesforce-cdc-worker/);
  assert.match(runbook, /\/Dockerfile\.preview/);
  assert.match(runbook, /npm run salesforce:cdc:worker/);
  assert.match(runbook, /Restart policy:\n\n`never`/);
  assert.match(runbook, /Replicas:\n\n`1`/);
  assert.match(runbook, /No public domain is required/);
});

test("readiness requires explicit enablement and bounded configuration", () => {
  assert.match(runbook, /SALESFORCE_CDC_WORKER_ENABLED=true/);
  assert.match(runbook, /SALESFORCE_CDC_WORKER_MAX_RUN_MS/);
  assert.match(runbook, /1000–300000/);
  assert.match(runbook, /CRON_SECRET/);
  assert.match(runbook, /APP_BASE_URL/);
});

test("activation sequence remains fail closed before enabling", () => {
  assert.match(runbook, /Leave `SALESFORCE_CDC_WORKER_ENABLED` unset or false/);
  assert.match(runbook, /Deploy and confirm the service fails closed/);
  assert.match(runbook, /Perform one manual run/);
  assert.match(runbook, /Only after successful manual evidence, add the reviewed cron schedule/);
});

test("rollback never instructs operators to advance replay state manually", () => {
  assert.match(runbook, /Do not manually advance Salesforce replay checkpoints/);
  assert.match(runbook, /Remove or disable the Railway cron schedule/);
  assert.match(runbook, /Preserve immutable receipt and normalized-event evidence/);
});

test("readiness package does not activate Railway or change the application start command", () => {
  assert.match(runbook, /does not:\n\n- create `salesforce-cdc-worker` in Railway/);
  assert.match(runbook, /change any Railway variable/);
  assert.match(runbook, /set `SALESFORCE_CDC_WORKER_ENABLED=true`/);
  assert.match(runbook, /add a Railway cron schedule/);
  assert.equal(packageJson.scripts["salesforce:cdc:worker"], "node scripts/run-salesforce-cdc-worker.mjs");
  assert.match(dockerfile, /run-salesforce-cdc-worker\.mjs/);
});

test("operator checklist covers fail-closed verification, manual evidence, and rollback", () => {
  assert.match(checklist, /Route returns 401 without bearer authorization/);
  assert.match(checklist, /Route returns 503 when worker enable flag is absent\/false/);
  assert.match(checklist, /Run exactly one manual invocation/);
  assert.match(checklist, /Confirm no QMS mutation/);
  assert.match(checklist, /Disable\/remove schedule/);
});
