import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ci = readFileSync(join(process.cwd(), ".github/workflows/ci.yml"), "utf8");

describe("CI workflow YAML admission", () => {
  it("uses a block scalar for the release metadata consistency command", () => {
    expect(ci).toContain("- name: Verify release metadata consistency\n        run: |");
  });

  it("preserves the release metadata mismatch guard", () => {
    expect(ci).toContain("Release version mismatch: package=");
  });
});
