import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const service = readFileSync(join(root, "src/lib/platform/system-health.ts"), "utf8");
const route = readFileSync(join(root, "src/app/api/platform/health/route.ts"), "utf8");
const panel = readFileSync(join(root, "src/components/platform-system-health-panel.tsx"), "utf8");
const shell = readFileSync(join(root, "src/components/platform-administration-shell.tsx"), "utf8");
const tenantAuthorization = readFileSync(join(root, "src/lib/security/authorization.ts"), "utf8");

describe("platform system health", () => {
  it("requires the dedicated platform health permission", () => {
    expect(service).toContain('permission: "platform.health.read"');
    expect(route).toContain("authenticatePlatformRequest(request)");
    expect(route).toContain("PlatformAuthorizationError");
  });

  it("uses sanitized release and environment classifications instead of dumping environment variables", () => {
    expect(service).toContain("APP_RELEASE_SHA");
    expect(service).toContain("RAILWAY_GIT_COMMIT_SHA");
    expect(service).toContain("TRACE_ENVIRONMENT_CLASS");
    expect(service).not.toContain("Object.entries(process.env)");
    expect(service).not.toContain("JSON.stringify(process.env)");
    expect(panel).toContain("Sanitized view");
    expect(panel).toContain("connection strings");
  });

  it("checks database connectivity and migration identity without returning database errors", () => {
    expect(service).toContain("SELECT 1 AS ok");
    expect(service).toContain('FROM "_prisma_migrations"');
    expect(service).toContain('databaseConnectivity = "UNAVAILABLE"');
    expect(route).toContain('error: "Platform system health could not be read"');
  });

  it("reports platform notification worker state and stale claims", () => {
    expect(service).toContain('FROM "PlatformNotification"');
    expect(service).toContain("DEAD_LETTER");
    expect(service).toContain("staleProcessing");
    expect(service).toContain("INTERVAL '5 minutes'");
    expect(panel).toContain("Notification delivery worker");
  });

  it("reports unimplemented integration health honestly rather than inventing provider status", () => {
    expect(service).toContain('status: integrationStatus');
    expect(service).toContain("Platform integration framework is not implemented until PR 10.");
    expect(service).not.toMatch(/stripe|quickbooks|salesforce|hubspot/i);
  });

  it("keeps health authority out of tenant authorization", () => {
    expect(tenantAuthorization).not.toContain("platform.health.read");
    expect(tenantAuthorization).not.toContain("platform.");
    expect(tenantAuthorization).not.toContain("superAdmin");
  });

  it("activates the permission-aware System health workspace", () => {
    expect(shell).toContain('label: "System health"');
    expect(shell).toContain('platform.health.read');
    expect(shell).toContain('phase: "available"');
    expect(shell).toContain("<PlatformSystemHealthPanel />");
  });

  it("uses a no-store health response and exposes no mutation route", () => {
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(route).not.toContain("export async function POST");
    expect(route).not.toContain("export async function PUT");
    expect(route).not.toContain("export async function DELETE");
  });
});
