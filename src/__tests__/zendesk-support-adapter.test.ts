import fs from "node:fs";
import path from "node:path";

describe("Zendesk support adapter governance", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/zendesk-support-adapter.ts"), "utf8");
  const runtime = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/integration-runtime.ts"), "utf8");

  it("registers Zendesk only through reviewed runtime composition", () => {
    expect(runtime).toContain("new ZendeskSupportAdapter()");
  });

  it("bounds outbound authority to support ticket creation", () => {
    expect(source).toContain('const ALLOWED_OUTBOUND = new Set(["zendesk.ticket.create"])');
    expect(source).toContain("/api/v2/tickets.json");
    expect(source).toContain("public: false");
    expect(source).toContain("Zendesk ticket field");
  });

  it("verifies signed webhooks with replay-window protection", () => {
    expect(source).toContain('x-zendesk-webhook-signature');
    expect(source).toContain('x-zendesk-webhook-signature-timestamp');
    expect(source).toContain('createHmac("sha256", secret).update(timestamp + rawBody');
    expect(source).toContain("5 * 60 * 1000");
    expect(source).toContain("timingSafeEqual");
  });

  it("keeps Zendesk outside Trace authorization authority", () => {
    expect(source).not.toContain("AuthorizationContext");
    expect(source).not.toContain("RolePermission");
    expect(source).not.toContain("PlatformPermission");
    expect(source).not.toContain("supportAccessGrant");
  });
});
