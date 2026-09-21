import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

const service=readFileSync(join(process.cwd(),"src/lib/platform/subscriptions.ts"),"utf8");
const route=readFileSync(join(process.cwd(),"src/app/api/platform/catalog/workspace/route.ts"),"utf8");
const catalog=readFileSync(join(process.cwd(),"src/components/platform-catalog-administration-panel.tsx"),"utf8");
const subscriptions=readFileSync(join(process.cwd(),"src/components/platform-subscriptions-panel.tsx"),"utf8");

describe("commercial catalog administration",()=>{
  it("exposes a platform-authorized consolidated catalog read model",()=>{
    expect(service).toContain("async catalogWorkspace");
    expect(service).toContain('permission: "platform.subscription.read"');
    expect(route).toContain("authenticatePlatformRequest");
  });
  it("uses governed catalog mutation APIs",()=>{
    expect(catalog).toContain("/api/platform/catalog/products");
    expect(catalog).toContain("/api/platform/catalog/features");
    expect(catalog).toContain("/api/platform/catalog/plans");
    expect(catalog).toContain("/versions");
    expect(catalog).toContain("/commercial-terms");
    expect(catalog).toContain("/features");
    expect(catalog).toContain("/activate");
  });
  it("keeps commercial edits draft-only before explicit activation",()=>{
    expect(catalog).toContain('version.status==="DRAFT"');
    expect(catalog).toContain("Activated plan versions and their feature matrix become immutable");
    expect(service).toContain("Commercial terms can only be changed on a draft plan version");
  });
  it("does not embed target public prices",()=>{
    expect(catalog).not.toMatch(/499|999|1499|2499/);
    expect(service).not.toMatch(/49900|99900|149900|249900/);
  });
  it("integrates catalog and customer subscriptions in one workspace",()=>{
    expect(subscriptions).toContain("PlatformCatalogAdministrationPanel");
    expect(subscriptions).toContain("Active plan versions");
    expect(subscriptions).toContain("Customer subscriptions");
  });
});
