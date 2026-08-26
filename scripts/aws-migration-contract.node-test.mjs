import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dockerfileUrl = new URL("../Dockerfile", import.meta.url);
const migrationUrl = new URL(
  "../deploy/aws/validation/migration-task-definition.json",
  import.meta.url,
);
const serviceUrl = new URL("../deploy/aws/validation/service.yaml", import.meta.url);

test("builds a dedicated non-root forward-only migration image", async () => {
  const dockerfile = await readFile(dockerfileUrl, "utf8");
  assert.match(dockerfile, /FROM dependencies AS migration/);
  assert.match(
    dockerfile,
    /USER node\nCMD \["\.\/node_modules\/\.bin\/prisma", "migrate", "deploy"\]/,
  );
  assert.doesNotMatch(dockerfile, /prisma migrate reset/);
});

test("runs migration by digest in the same architecture as the service", async () => {
  const migration = JSON.parse(await readFile(migrationUrl, "utf8"));
  const service = await readFile(serviceUrl, "utf8");
  assert.equal(migration.runtimePlatform.cpuArchitecture, "X86_64");
  assert.equal(
    migration.containerDefinitions[0].image,
    "${IMAGE_URI}@${MIGRATION_IMAGE_DIGEST}",
  );
  assert.match(service, /CpuArchitecture: X86_64/);
  assert.doesNotMatch(service, /CpuArchitecture: ARM64/);
});

test("passes only the database secret to the one-time task", async () => {
  const migration = JSON.parse(await readFile(migrationUrl, "utf8"));
  assert.deepEqual(migration.containerDefinitions[0].secrets, [
    { name: "DATABASE_URL", valueFrom: "${DATABASE_URL_SECRET_ARN}" },
  ]);
  assert.equal(JSON.stringify(migration).includes("postgresql://"), false);
});
