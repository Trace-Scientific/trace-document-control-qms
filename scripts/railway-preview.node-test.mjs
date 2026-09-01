import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = await readFile(".railway/railway.ts", "utf8");
const runbook = await readFile(
  "docs/operations/railway-preview-runbook.md",
  "utf8",
);
const page = await readFile("src/app/page.tsx", "utf8");
const previewDockerfile = await readFile("Dockerfile.preview", "utf8");
const productionDockerfile = await readFile("Dockerfile", "utf8");

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

test("preview image deploys migrations without changing the AWS runtime", () => {
  assert.match(
    previewDockerfile,
    /prisma migrate deploy --schema prisma\/schema\.prisma && exec node server\.js/,
  );
  assert.match(previewDockerfile, /USER qms/);
  assert.match(previewDockerfile, /\/api\/health\/readiness/);
  assert.doesNotMatch(productionDockerfile, /prisma migrate deploy && node server\.js/);
  assert.match(runbook, /\/Dockerfile\.preview/);
});

test("preview image packages the controlled first-administrator bootstrap only in preview", () => {
  assert.match(
    previewDockerfile,
    /COPY --from=builder --chown=qms:qms \/app\/scripts\/bootstrap-admin\.mjs \.\/scripts\/bootstrap-admin\.mjs/,
  );
  assert.doesNotMatch(productionDockerfile, /bootstrap-admin\.mjs/);
});
