import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("release candidate 0.1.0-rc.9 identity", () => {
  const activeSurfaces = [
    "package.json",
    "package-lock.json",
    "Dockerfile",
    "README.md",
    "deploy/aws/validation/README.md",
    "deploy/aws/validation/service.yaml",
    ".github/workflows/ci.yml",
    ".github/workflows/aws-validation-release.yml",
  ];

  it("reconciles all active release identity surfaces to rc.9", () => {
    for (const path of activeSurfaces) {
      expect(read(path)).toContain("0.1.0-rc.9");
    }
  });

  it("records the controlled source baseline and fail-closed boundaries", () => {
    const record = read("docs/validation/release-candidate-0.1.0-rc.9.md");
    expect(record).toContain("28a391ecc4dc3ac68747631d332857edbcf1d8cd");
    expect(record).toContain("fresh CI/Security evidence");
    expect(record).toContain("AWS remains **PLAN-only**");
    expect(record).toContain("UM-QMS-001");
  });

  it("preserves the historical rc.8 candidate record", () => {
    expect(read("docs/validation/release-candidate-0.1.0-rc.8.md")).toContain(
      "# Release candidate 0.1.0-rc.8",
    );
  });
});
