import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const script = readFileSync(join(root, "scripts/bootstrap-platform-admin.mjs"), "utf8");
const docker = readFileSync(join(root, "Dockerfile.preview"), "utf8");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

test("platform admin bootstrap requires explicit target and confirmation", () => {
  assert.match(script, /PLATFORM_BOOTSTRAP_USER_EMAIL/);
  assert.match(script, /PROVISION-PLATFORM-ADMIN/);
  assert.match(script, /Exactly one existing tenant user/);
});

test("platform admin bootstrap preserves platform authorization separation", () => {
  assert.match(script, /PlatformIdentity/);
  assert.match(script, /PlatformMembership/);
  assert.match(script, /PlatformMembershipRole/);
  assert.match(script, /PlatformRolePermission/);
  assert.doesNotMatch(script, /UserRole/);
});

test("platform admin bootstrap grants the controlled platform role and audits the run", () => {
  assert.match(script, /Platform Administrator/);
  assert.match(script, /platform\.help\.manage/);
  assert.match(script, /platform\.security\.manage/);
  assert.match(script, /PlatformAuditEvent/);
  assert.match(script, /bootstrap_provisioned/);
  assert.match(script, /bootstrap_verified/);
  assert.match(script, /ON CONFLICT/);
});

test("preview image packages the bootstrap and package.json exposes a controlled command", () => {
  assert.match(docker, /bootstrap-platform-admin\.mjs/);
  assert.equal(pkg.scripts["platform-admin:bootstrap"], "node scripts/bootstrap-platform-admin.mjs");
});
