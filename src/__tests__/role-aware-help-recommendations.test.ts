import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { helpRecommendations } from "@/lib/help/help-recommendations";
import type { AuthorizationContext } from "@/lib/security/authorization";

function context(permissions: string[]): AuthorizationContext {
  return {
    userId: "00000000-0000-0000-0000-000000000001",
    organizationId: "00000000-0000-0000-0000-000000000002",
    userState: "ACTIVE",
    grants: permissions.map((permission) => ({ permission, scopeType: "ORGANIZATION" as const, scopeId: null })),
  };
}

const route = readFileSync(join(process.cwd(), "src/app/api/help/recommendations/route.ts"), "utf8");
const ui = readFileSync(join(process.cwd(), "src/components/help-center.tsx"), "utf8");

describe("role-aware Help recommendations", () => {
  it("recommends only workspaces represented by existing permissions", () => {
    const rows = helpRecommendations(context(["document.read", "training.read"]), "training");
    expect(rows.map((row) => row.key)).toContain("documents");
    expect(rows.map((row) => row.key)).toContain("training");
    expect(rows.map((row) => row.key)).not.toContain("quality");
    expect(rows.map((row) => row.key)).not.toContain("administration");
  });

  it("prioritizes the current context when it is authorized", () => {
    const rows = helpRecommendations(context(["document.read", "training.read", "record.read"]), "training");
    expect(rows[0]?.key).toBe("training");
  });

  it("does not infer access for inactive users", () => {
    const inactive = { ...context(["document.read"]), userState: "SUSPENDED" as const };
    expect(helpRecommendations(inactive, "documents")).toEqual([]);
  });

  it("derives authorization from authenticated server context and bounds page context", () => {
    expect(route).toContain("authenticateRequest(request)");
    expect(route).toContain("safeContexts");
    expect(route).toContain("helpRecommendations(context, pageContext)");
    expect(route).not.toContain("permission=");
  });

  it("states that Help recommendations do not grant access", () => {
    expect(ui).toContain("RECOMMENDED FOR YOUR ACCESS");
    expect(ui).toContain("Help does not grant additional access");
    expect(ui).toContain("/api/help/recommendations?context=");
  });
});
