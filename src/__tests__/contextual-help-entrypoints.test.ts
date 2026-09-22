import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(
  join(process.cwd(), "src/components/document-control-dashboard.tsx"),
  "utf8",
);
const modules = readFileSync(
  join(process.cwd(), "src/components/qms-module-shell.tsx"),
  "utf8",
);
const help = readFileSync(
  join(process.cwd(), "src/components/help-center.tsx"),
  "utf8",
);

describe("contextual Help Center entrypoints", () => {
  it("keeps Help persistently reachable from the primary tenant shell", () => {
    expect(dashboard).toContain('className="sidebar-help-link"');
    expect(dashboard).toContain("/help?context=");
    expect(dashboard).toContain('view.toLowerCase().replaceAll(" ", "-")');
  });

  it("passes the active QMS module into Help", () => {
    expect(modules).toContain("/help?context=");
    expect(modules).toContain("encodeURIComponent(active.id)");
    expect(modules).toContain("Open Help Center for");
  });

  it("maps major workspaces to bounded published-help searches", () => {
    for (const context of [
      "documents",
      "review-queue",
      "administration",
      "records",
      "personnel",
      "training",
      "quality",
      "laboratory",
      "reporting",
    ]) {
      expect(help).toMatch(new RegExp(`["']?${context.replace(/[.*+?^${}()|[\]\\]/g, "\\expect(help).toContain(context + ":");")}["']?\\s*:`));
    }
    expect(help).toContain("new URLSearchParams(window.location.search)");
    expect(help).toContain("contextualSearch");
    expect(help).toContain("loadArticles(initialQuery)");
  });

  it("does not bypass the existing authenticated Help APIs", () => {
    expect(help).toContain("/api/help/articles");
    expect(help).toContain("/api/help/manuals");
    expect(help).not.toContain('fetch("http');
    expect(help).not.toContain("localStorage");
  });

  it("allows users to recover when contextual search has no published match", () => {
    expect(help).toContain("No published help article matched this context");
    expect(help).toContain("Clear or broaden the search");
  });
});
