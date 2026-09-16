import fs from "node:fs";
import path from "node:path";

describe("Provider-safe inbound webhook boundary", () => {
  const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/platform/integrations/inbound/[connectionId]/route.ts"), "utf8");
  const inbound = fs.readFileSync(path.join(process.cwd(), "src/lib/platform/integration-inbound.ts"), "utf8");

  it("preserves exact request bytes before decoding", () => {
    expect(route).toContain("await request.arrayBuffer()");
    expect(route).toContain("new Uint8Array");
    expect(route).toContain("MAX_WEBHOOK_BYTES");
    expect(route).not.toContain("await request.text()");
  });

  it("derives fallback idempotency and receipt hash from exact bytes", () => {
    expect(route).toContain('update(rawBodyBytes).digest("hex")');
    expect(inbound).toContain('update(input.rawBodyBytes).digest("hex")');
  });

  it("passes canonical request URL and form parameters to provider adapters", () => {
    expect(route).toContain("requestUrl: request.url");
    expect(route).toContain("collectFormParameters");
    expect(inbound).toContain("requestUrl: input.requestUrl");
    expect(inbound).toContain("formParameters: input.formParameters");
  });

  it("retains a decoded text body for backward-compatible JSON adapters", () => {
    expect(route).toContain('new TextDecoder("utf-8"');
    expect(inbound).toContain("rawBody: input.rawBody");
  });
});
