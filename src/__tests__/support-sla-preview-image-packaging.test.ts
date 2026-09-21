import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync(join(process.cwd(), "Dockerfile.preview"), "utf8");
const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));

describe("support SLA preview image packaging", () => {
  it("packages the support SLA runner used by the Railway start command", () => {
    expect(pkg.scripts["support:sla:scan"]).toBe("node scripts/run-support-sla-scan.mjs");
    expect(dockerfile).toContain("/app/scripts/run-support-sla-scan.mjs ./scripts/run-support-sla-scan.mjs");
  });

  it("keeps the preview image non-root", () => {
    expect(dockerfile).toContain("USER qms");
  });
});
