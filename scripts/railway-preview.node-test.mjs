import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = await readFile(".railway/railway.ts", "utf8");
const runbook = await readFile(
  "docs/operations/railway-preview-runbook.md",
  "utf8",
);
const page = await readFile("src/app/page.tsx", "utf8");

test("preview infrastructure remains small and isolated", () => {
  assert.match(config, /postgres\("preview-postgres"\)/);
  assert.match(config, /branch: "main"/);
  assert.match(config, /replicas: 1/);
  assert.match(config, /healthcheck: "\/api\/health\/readiness"/);
  assert.match(config, /DATABASE_URL: database\.env\.DATABASE_URL/);
});

test("preview fails closed on migrations and contains no secrets", () => {
  assert.match(config, /start: "npm run preview:start"/);
  assert.doesNotMatch(config, /CRON_SECRET:/);
  assert.doesNotMatch(config, /APP_BASE_URL:/);
  assert.doesNotMatch(config, /postgres(?:ql)?:\/\//i);
  assert.match(runbook, /synthetic data only/i);
  assert.match(runbook, /not a qualified validation or production environment/i);
});

test("preview warning is derived from a server-side runtime boundary", () => {
  assert.match(config, /DEPLOYMENT_TIER: "development-preview"/);
  assert.doesNotMatch(config, /NEXT_PUBLIC_DEPLOYMENT_TIER/);
  assert.match(page, /process\.env\.DEPLOYMENT_TIER === "development-preview"/);
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.doesNotMatch(page, /NEXT_PUBLIC_/);
});
