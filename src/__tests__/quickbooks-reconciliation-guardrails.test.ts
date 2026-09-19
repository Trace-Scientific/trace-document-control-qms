import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const inbound = readFileSync(join(process.cwd(), "src/lib/platform/integration-inbound.ts"), "utf8");
const adapter = readFileSync(join(process.cwd(), "src/lib/platform/quickbooks-adapter.ts"), "utf8");

describe("QuickBooks reconciliation guardrails", () => {
  it("keeps QuickBooks inbound events observational rather than delivery-reconciling", () => {
    expect(adapter).toContain('eventType: "quickbooks.accounting.data_change"');
    expect(inbound).not.toContain("applyVerifiedQuickBooks");
    expect(inbound).not.toContain("QUICKBOOKS_SIGNED_CALLBACK_CONFIRMED_PROVIDER_ACCEPTANCE");
  });

  it("does not fabricate a Trace delivery key from QuickBooks entity changes", () => {
    expect(adapter).not.toContain("trace_delivery_key");
    expect(adapter).not.toContain("deliveryKey");
  });

  it("retains exact-byte signature verification at the adapter boundary", () => {
    expect(adapter).toContain("rawBodyBytes");
    expect(adapter).toContain('update(rawBodyBytes).digest("base64")');
    expect(adapter).toContain('input.headers.get("intuit-signature")');
  });
});
