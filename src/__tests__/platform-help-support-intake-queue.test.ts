import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const service = readFileSync(join(process.cwd(), "src/lib/platform/help-support-queue.ts"), "utf8");
const route = readFileSync(join(process.cwd(), "src/app/api/platform/support/intake/route.ts"), "utf8");
const panel = readFileSync(join(process.cwd(), "src/components/platform-support-intake-panel.tsx"), "utf8");
const shell = readFileSync(join(process.cwd(), "src/components/platform-administration-shell.tsx"), "utf8");

describe("Trace-side Help support intake queue", () => {
  it("requires platform support permission for queue read and lifecycle actions", () => {
    expect(service).toContain('permission: "platform.support.request"');
    expect(route).toContain("authenticatePlatformRequest(request)");
  });

  it("keeps intake lifecycle separate from controlled support access", () => {
    expect(service).not.toContain("SupportAccessRequest");
    expect(service).not.toContain("SupportSession");
    expect(service).not.toContain("support.tenant.");
    expect(panel).toContain('href="/support-access"');
  });

  it("supports only acknowledge and close transitions", () => {
    expect(route).toContain('z.literal("ACKNOWLEDGE")');
    expect(route).toContain('z.literal("CLOSE")');
    expect(service).toContain('"status" = \'ACKNOWLEDGED\'');
    expect(service).toContain('"status" = \'CLOSED\'');
    expect(service).not.toContain("REOPEN");
  });

  it("uses sanitized queue reads and no-store caching", () => {
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(service).toContain('o."displayName" AS "organizationName"');
    expect(service).toContain('CONCAT_WS');
    expect(service).not.toContain("tokenHash");
    expect(service).not.toContain("credential");
  });

  it("surfaces the queue in Platform Administration", () => {
    expect(shell).toContain("PlatformSupportIntakePanel");
    expect(panel).toContain("Customer support intake");
    expect(panel).toContain("Acknowledge");
    expect(panel).toContain("Close");
  });
});
