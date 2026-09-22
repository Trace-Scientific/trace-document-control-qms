import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const platformPage = readFileSync(join(root, "src/app/platform/page.tsx"), "utf8");
const platformShell = readFileSync(join(root, "src/components/platform-administration-shell.tsx"), "utf8");
const platformMe = readFileSync(join(root, "src/app/api/platform/me/route.ts"), "utf8");
const tenantPage = readFileSync(join(root, "src/app/page.tsx"), "utf8");
const tenantAuthorization = readFileSync(join(root, "src/lib/security/authorization.ts"), "utf8");
const tenantAdministration = readFileSync(join(root, "src/components/access-administration.tsx"), "utf8");

describe("platform administration shell", () => {
  it("uses a dedicated top-level platform route instead of the tenant QMS shell", () => {
    expect(platformPage).toContain("PlatformAdministrationShell");
    expect(platformPage).not.toContain("QmsModuleShell");
    expect(platformShell).not.toContain("workspaceVisibility");
    expect(platformShell).not.toContain("RolePermission");
  });

  it("loads server-authoritative platform grants without copying tenant grants", () => {
    expect(platformMe).toContain("authenticatePlatformRequest");
    expect(platformMe).toContain("permissions: context.grants");
    expect(platformMe).not.toContain("tenantActor.grants");
  });

  it("keeps platform navigation permission aware", () => {
    expect(platformShell).toContain("platform.organization.read");
    expect(platformShell).toContain("platform.subscription.read");
    expect(platformShell).toContain("platform.support.access");
    expect(platformShell).toContain("platform.audit.read");
    expect(platformShell).toContain("platform.security.manage");
    expect(platformShell).toContain("canSee(section");
  });

  it("does not add platform authority to ordinary tenant authorization", () => {
    expect(tenantAuthorization).not.toContain("platform.");
    expect(tenantAuthorization).not.toContain("superAdmin");
    expect(tenantAuthorization).not.toContain("bypass");
  });

  it("surfaces a tenant-side platform entry only after server-authoritative platform access succeeds", () => {
    expect(tenantAdministration).toContain('fetch("/api/platform/me"');
    expect(tenantAdministration).toContain("setPlatformAccess(response.ok)");
    expect(tenantAdministration).toContain('href="/platform"');
    expect(tenantAdministration).toContain("Help &amp; User Manual");
  });

  it("does not convert the tenant homepage into the platform control surface", () => {
    expect(tenantPage).toContain("QmsModuleShell");
    expect(tenantPage).not.toContain("PlatformAdministrationShell");
  });

  it("surfaces governed platform domains with explicit implementation phases", () => {
    expect(platformShell).toContain('label: "Sales"');
    expect(platformShell).toContain('label: "Commissions"');
    expect(platformShell).toContain('label: "Help & User Manual"');
    expect(platformShell).toContain('label: "System health"');
    expect(platformShell).toContain('label: "Integrations"');
    expect(platformShell).toContain('phase: "foundation"');
    expect(platformShell).toContain('phase: "available"');
  });
});
