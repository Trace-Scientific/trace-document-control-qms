import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("historical release candidate 0.1.0-rc.8 evidence", () => {
  it("preserves the immutable rc.8 candidate record", () => {
    expect(read("docs/validation/release-candidate-0.1.0-rc.8.md")).toContain(
      "# Release candidate 0.1.0-rc.8",
    );
  });

  it("records the controlled source baseline and fail-closed boundaries", () => {
    const record = read("docs/validation/release-candidate-0.1.0-rc.8.md");
    expect(record).toContain("dd4120bba1623588fd13e26455773e3494b5ce58");
    expect(record).toContain("fresh CI/Security evidence");
    expect(record).toContain("AWS remains **PLAN-only**");
    expect(record).toContain("UM-QMS-001");
  });

  it("preserves the historical rc.7 candidate record", () => {
    expect(read("docs/validation/release-candidate-0.1.0-rc.7.md")).toContain(
      "# Release candidate 0.1.0-rc.7",
    );
  });
});
