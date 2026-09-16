import fs from "node:fs";
import path from "node:path";

describe("Salesforce CRM adapter governance", () => {
  const salesforce = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/salesforce-adapter.ts"), "utf8");
  const runtime = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/integration-runtime.ts"), "utf8");

  it("registers Salesforce only through reviewed runtime composition", () => {
    expect(runtime).toContain("new SalesforceCrmAdapter()");
  });

  it("bounds outbound CRM objects and operations", () => {
    expect(salesforce).toContain('"salesforce.account.create"');
    expect(salesforce).toContain('"salesforce.contact.create"');
    expect(salesforce).toContain('"salesforce.opportunity.create"');
    expect(salesforce).not.toContain("DELETE");
    expect(salesforce).not.toContain('method: "PATCH"');
  });

  it("prevents caller-controlled Salesforce hosts", () => {
    expect(salesforce).toContain('.endsWith(".my.salesforce.com")');
    expect(salesforce).toContain('.endsWith(".salesforce.com")');
    expect(salesforce).toContain('url.protocol !== "https:"');
  });

  it("keeps provider record identity out of create payloads", () => {
    expect(salesforce).toContain('"Id" in record');
    expect(salesforce).toContain('"attributes" in record');
  });

  it("keeps inbound CDC disabled until a reviewed Pub/Sub subscriber exists", () => {
    expect(salesforce).toContain("Pub/Sub API subscriber");
    expect(salesforce).not.toContain("ChangeEventHeader");
  });

  it("does not grant Salesforce authorization authority", () => {
    expect(salesforce).not.toContain("AuthorizationContext");
    expect(salesforce).not.toContain("RolePermission");
    expect(salesforce).not.toContain("PlatformPermission");
  });
});
