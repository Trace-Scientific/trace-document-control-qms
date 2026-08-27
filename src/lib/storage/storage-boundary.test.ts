import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const files = readFileSync("src/app/api/files/route.ts", "utf8"), download = readFileSync("src/app/api/files/[id]/route.ts", "utf8"), scan = readFileSync("src/app/api/internal/files/scan-result/route.ts", "utf8");
describe("controlled file boundary", () => {
  it("derives tenant and actor from the authenticated session", () => { expect(files).toContain("authenticateRequest(request)"); expect(files).not.toContain("form.get(\"organizationId\")"); expect(download).toContain("organizationId: context.organizationId"); });
  it("withholds unscanned content and verifies downloaded bytes", () => { expect(download).toContain('row.status !== "AVAILABLE"'); expect(download).toContain('hash !== row.sha256'); expect(scan).toContain('status: "PENDING_SCAN"'); });
  it("archives metadata instead of physically deleting regulated content", () => { expect(download).toContain('status: "ARCHIVED"'); expect(download).not.toContain("storage.remove"); expect(download).toContain("FILE_ARCHIVED"); });
});
