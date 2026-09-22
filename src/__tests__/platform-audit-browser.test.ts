import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

const migration=readFileSync(join(process.cwd(),"prisma/migrations/20260916180000_platform_security_foundation/migration.sql"),"utf8");
const service=readFileSync(join(process.cwd(),"src/lib/platform/audit-read.ts"),"utf8");
const route=readFileSync(join(process.cwd(),"src/app/api/platform/audit/route.ts"),"utf8");
const panel=readFileSync(join(process.cwd(),"src/components/platform-audit-panel.tsx"),"utf8");
const shell=readFileSync(join(process.cwd(),"src/components/platform-administration-shell.tsx"),"utf8");

describe("platform audit browser",()=>{
  it("preserves append-only database enforcement",()=>{
    expect(migration).toContain("PlatformAuditEvent rows are append-only");
    expect(migration).toContain('"PlatformAuditEvent_no_update_delete"');
  });

  it("requires platform audit read permission",()=>{
    expect(service).toContain('permission: "platform.audit.read"');
    expect(route).toContain("authenticatePlatformRequest");
  });

  it("supports bounded filters and cursor pagination",()=>{
    expect(service).toContain("Math.min(200");
    expect(service).toContain("cursorOccurredAt");
    expect(service).toContain('ORDER BY pae."occurredAt" DESC,pae."id" DESC');
    expect(panel).toContain("Load older events");
  });

  it("joins only platform actor metadata and not tenant QMS content",()=>{
    expect(service).toContain('LEFT JOIN "PlatformIdentity"');
    expect(service).toContain('LEFT JOIN "User"');
    expect(service).not.toContain('"Document"');
    expect(service).not.toContain('"TrainingRecord"');
    expect(service).not.toContain('"QualityEvent"');
    expect(service).not.toContain('"Organization"');
    expect(panel).toContain("does not join tenant document, training, quality, laboratory");
  });

  it("is read-only and uses no-store caching",()=>{
    expect(route).toContain('export async function GET');
    expect(route).not.toContain('export async function POST');
    expect(route).not.toContain('export async function PATCH');
    expect(route).not.toContain('export async function DELETE');
    expect(route).toContain('"Cache-Control":"no-store"');
  });

  it("replaces the placeholder audit card in Platform Administration",()=>{
    expect(shell).toContain("<PlatformAuditPanel />");
    expect(shell).not.toContain("A dedicated audit browser will be added");
  });
});
