import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = await readFile(".railway/railway.ts", "utf8");
const runbook = await readFile(
  "docs/operations/railway-preview-runbook.md",
  "utf8",
);
const page = await readFile("src/app/page.tsx", "utf8");
const loginPage = await readFile("src/app/login/page.tsx", "utf8");
const loginForm = await readFile("src/app/login/login-form.tsx", "utf8");
const previewDockerfile = await readFile("Dockerfile.preview", "utf8");
const productionDockerfile = await readFile("Dockerfile", "utf8");
const equipmentOverdueRunner = await readFile(
  "scripts/run-equipment-overdue.mjs",
  "utf8",
);

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

test("login and footer show the preview warning only for the runtime preview tier", () => {
  assert.match(loginPage, /export const dynamic = "force-dynamic"/);
  assert.match(loginPage, /developmentPreview = process\.env\.DEPLOYMENT_TIER === "development-preview"/);
  assert.match(loginPage, /<LoginForm developmentPreview=\{developmentPreview\}/);
  assert.match(loginPage, /developmentPreview && <span>Development preview<\/span>/);
  assert.match(loginForm, /developmentPreview && <small[^>]*>Development preview · Synthetic data only<\/small>/);
  assert.doesNotMatch(loginForm, /process\.env/);
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

test("preview runtime excludes development tools and retains Prisma for startup migrations", () => {
  const [dependencies, runtime] = previewDockerfile.split("FROM node:22-alpine AS preview\n");
  assert.ok(runtime);
  assert.match(dependencies, /FROM dependencies AS preview-dependencies/);
  assert.match(dependencies, /npm pkg set "dependencies\.prisma=/);
  assert.match(dependencies, /npm prune --omit=dev --ignore-scripts --offline/);
  assert.match(runtime, /COPY --from=preview-dependencies --chown=qms:qms \/app\/node_modules \.\/node_modules/);
  assert.doesNotMatch(runtime, /COPY --from=dependencies .*\/app\/node_modules/);
});

test("preview image packages the controlled first-administrator bootstrap only in preview", () => {
  assert.match(
    previewDockerfile,
    /COPY --from=builder --chown=qms:qms \/app\/scripts\/bootstrap-admin\.mjs \.\/scripts\/bootstrap-admin\.mjs/,
  );
  assert.doesNotMatch(productionDockerfile, /bootstrap-admin\.mjs/);
});

test("equipment overdue cron runner is documented and fails closed on configuration", () => {
  assert.match(runbook, /equipment-overdue-monitor/);
  assert.match(runbook, /node scripts\/run-equipment-overdue\.mjs/);
  assert.match(runbook, /\*\/15 \* \* \* \*/);
  assert.match(equipmentOverdueRunner, /process\.env\.APP_BASE_URL/);
  assert.match(equipmentOverdueRunner, /process\.env\.CRON_SECRET/);
  assert.match(equipmentOverdueRunner, /secret\.length < 32/);
  assert.match(equipmentOverdueRunner, /\/api\/internal\/equipment-overdue/);
  assert.match(equipmentOverdueRunner, /authorization: `Bearer \$\{secret\}`/);
  assert.doesNotMatch(equipmentOverdueRunner, /a-secure-overdue-monitor-secret/);
});
