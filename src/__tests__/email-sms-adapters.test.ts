import fs from "node:fs";
import path from "node:path";

describe("Email and SMS provider adapter governance", () => {
  const sendgrid = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/sendgrid-email-adapter.ts"), "utf8");
  const twilio = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/twilio-sms-adapter.ts"), "utf8");
  const runtime = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/integration-runtime.ts"), "utf8");

  it("registers providers only through reviewed runtime composition", () => {
    expect(runtime).toContain("new SendGridEmailAdapter()");
    expect(runtime).toContain("new TwilioSmsAdapter()");
  });

  it("bounds SendGrid to controlled email sends", () => {
    expect(sendgrid).toContain('const ALLOWED_EVENT = "sendgrid.email.send"');
    expect(sendgrid).toContain('"https://api.sendgrid.com"');
    expect(sendgrid).toContain('"https://api.eu.sendgrid.com"');
    expect(sendgrid).toContain("attachments");
    expect(sendgrid).toContain("Advanced SendGrid payload features are not allowed");
  });

  it("bounds Twilio to controlled SMS sends", () => {
    expect(twilio).toContain('const ALLOWED_EVENT = "twilio.sms.send"');
    expect(twilio).toContain("Messages.json");
    expect(twilio).toContain("must be E.164");
    expect(twilio).toContain("Advanced Twilio messaging features are not allowed");
  });

  it("does not fake provider webhook verification on an insufficient generic boundary", () => {
    expect(sendgrid).toContain("disabled until raw-byte signature verification is available");
    expect(twilio).toContain("disabled until canonical URL/form signature verification is available");
  });

  it("does not grant providers tenant or platform authority", () => {
    for (const source of [sendgrid, twilio]) {
      expect(source).not.toContain("AuthorizationContext");
      expect(source).not.toContain("RolePermission");
      expect(source).not.toContain("PlatformPermission");
      expect(source).not.toContain("electronic signature");
    }
  });
});
