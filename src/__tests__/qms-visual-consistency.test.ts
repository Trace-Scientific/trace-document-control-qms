import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("QMS visual consistency", () => {
  const globals = read("src/app/globals.css");
  const help = read("src/components/help-center.module.css");
  const platform = read("src/components/platform-administration-shell.module.css");
  const workspaces = read("src/app/module-workspaces.css");
  const modules = read("src/app/sidebar-overlap-fix.css");

  it("defines the Documents visual system as shared design tokens", () => {
    for (const token of [
      "--navy:",
      "--blue:",
      "--surface:",
      "--surface-subtle:",
      "--surface-accent:",
      "--heading-font:",
      "--panel-radius:",
      "--panel-shadow:",
    ]) expect(globals).toContain(token);
  });

  it("uses shared QMS tokens in Help and Platform Administration", () => {
    expect(help).toContain("var(--heading-font)");
    expect(help).toContain("var(--surface-accent)");
    expect(help).toContain("var(--panel-radius)");
    expect(platform).toContain("var(--heading-font)");
    expect(platform).toContain("linear-gradient(180deg,#10233f,#0d1e35)");
    expect(platform).toContain("var(--surface-accent)");
  });

  it("keeps secondary QMS workspaces on the same surface system", () => {
    expect(workspaces).toContain("var(--surface-subtle)");
    expect(workspaces).toContain("var(--panel-shadow)");
    expect(modules).toContain("var(--surface-subtle)");
    expect(modules).toContain("var(--surface-accent)");
  });
});
