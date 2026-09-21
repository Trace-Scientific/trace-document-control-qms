import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const service = readFileSync(join(process.cwd(), "src/lib/platform/subscriptions.ts"), "utf8");
const route = readFileSync(join(process.cwd(), "src/app/api/platform/subscriptions/workspace/route.ts"), "utf8");
const panel = readFileSync(join(process.cwd(), "src/components/platform-subscriptions-panel.tsx"), "utf8");
const shell = readFileSync(join(process.cwd(), "src/components/platform-administration-shell.tsx"), "utf8");

describe("platform subscriptions administration workspace", () => {
  it("requires platform subscription read permission for the workspace read model", () => {
    expect(service).toContain('permission: "platform.subscription.read"');
    expect(service).toContain("async workspace");
    expect(route).toContain("authenticatePlatformRequest");
  });

  it("shows immutable active plan-version commercial terms", () => {
    expect(service).toContain('pv."status"=\'ACTIVE\'');
    expect(service).toContain('"baseAmountCents"');
    expect(service).toContain('"includedFullUsers"');
    expect(panel).toContain("Existing subscriptions remain pinned to their contracted version");
  });

  it("uses existing governed mutation APIs rather than duplicating business logic", () => {
    expect(panel).toContain('fetch("/api/platform/subscriptions"');
    expect(panel).toContain('fetch("/api/platform/subscriptions/"+encodeURIComponent(subscription.id)');
    expect(panel).toContain("expectedLockVersion:subscription.lockVersion");
  });

  it("keeps subscription management permission separate from visibility", () => {
    expect(shell).toContain('canManage={permissions.includes("platform.subscription.manage")}');
    expect(panel).toContain("canManage");
  });

  it("states that commercial entitlements do not create tenant permissions", () => {
    expect(panel).toContain("They do not create tenant permissions");
    expect(panel).toContain("separate from tenant QMS roles");
  });
});
