import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "prisma/migrations/20260921021500_help_support_request_intake/migration.sql"), "utf8");
const service = readFileSync(join(process.cwd(), "src/lib/platform/help-support-request.ts"), "utf8");
const route = readFileSync(join(process.cwd(), "src/app/api/help/support-requests/route.ts"), "utf8");
const help = readFileSync(join(process.cwd(), "src/components/help-center.tsx"), "utf8");

describe("Help Center support request intake", () => {
  it("stores tenant-scoped support intake without support-access grants", () => {
    expect(migration).toContain('CREATE TABLE "HelpSupportRequest"');
    expect(migration).toContain('"organizationId" UUID NOT NULL');
    expect(migration).toContain('"submittedByUserId" UUID NOT NULL');
    expect(migration).not.toContain("SupportAccessRequest");
    expect(migration).not.toContain("SupportSession");
  });

  it("accepts only bounded diagnostic metadata", () => {
    expect(service).toContain("SAFE_PAGE_CONTEXTS");
    expect(service).toContain("browserFamily");
    expect(service).toContain("correlationIdPresent");
    expect(service).not.toContain("userAgent");
    expect(service).not.toContain("documentId");
    expect(service).not.toContain("recordId");
    expect(service).not.toContain("password");
  });

  it("requires an authenticated tenant session", () => {
    expect(route).toContain("authenticateRequest(request)");
    expect(route).toContain("Authentication required");
    expect(route).not.toContain("authenticatePlatformRequest");
  });

  it("warns users not to submit secrets or regulated content", () => {
    expect(help).toContain("passwords, credentials, patient information, controlled document content");
    expect(help).toContain("Safe diagnostic context included automatically");
    expect(help).toContain("/api/help/support-requests");
  });

  it("sends browser family rather than the raw user agent", () => {
    expect(help).toContain("browserFamily");
    expect(help).toContain("navigator.userAgent");
    expect(help).not.toContain("userAgent,");
  });
});
