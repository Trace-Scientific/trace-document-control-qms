import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderManualReleasePdf } from "@/lib/platform/manual-pdf";

const migration = readFileSync(join(process.cwd(), "prisma/migrations/20260921221000_manual_release_pdf_snapshots/migration.sql"), "utf8");
const service = readFileSync(join(process.cwd(), "src/lib/platform/manual-release-snapshots.ts"), "utf8");
const ui = readFileSync(join(process.cwd(), "src/components/platform-controlled-user-manual-panel.tsx"), "utf8");
const api = readFileSync(join(process.cwd(), "src/app/api/platform/help/manual-releases/[releaseId]/snapshots/route.ts"), "utf8");
const download = readFileSync(join(process.cwd(), "src/app/api/platform/help/manual-releases/[releaseId]/snapshots/[snapshotId]/route.ts"), "utf8");

describe("controlled user manual PDF snapshots", () => {
  it("renders a real PDF document without a new runtime dependency", () => {
    const bytes = renderManualReleasePdf({
      manualCode: "UM-QMS-001",
      manualName: "Trace QMS Controlled User Manual",
      version: "0.1",
      status: "DRAFT",
      effectiveAt: null,
      publishedAt: null,
      releaseNotes: "Reviewed draft",
      generatedAt: new Date("2026-09-21T00:00:00.000Z"),
      sections: [{ sectionCode: "UM-01", title: "Governance", revisionNumber: 1, body: "Controlled content." }],
    });
    expect(Buffer.from(bytes).subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
    expect(Buffer.from(bytes).toString("ascii")).toContain("Release status: DRAFT");
    expect(Buffer.from(bytes).toString("ascii")).toContain("UM-01 - Governance");
  });

  it("stores immutable platform-scoped snapshot metadata and exact revision IDs", () => {
    expect(migration).toContain('CREATE TABLE "UserManualReleaseSnapshot"');
    expect(migration).toContain('"sectionRevisionIds" UUID[] NOT NULL');
    expect(migration).toContain('"sha256" TEXT NOT NULL');
    expect(migration).toContain('"UserManualReleaseSnapshot_immutable"');
    expect(migration).toContain("prevent_manual_release_snapshot_mutation");
  });

  it("requires platform.help.manage and private object storage", () => {
    expect(service).toContain('permission: "platform.help.manage"');
    expect(service).toContain("PrivateObjectStorage");
    expect(service).toContain("platform/manual-snapshots/");
    expect(service).toContain('"manual.snapshot.created"');
    expect(service).toContain("sectionRevisionIds: sections.map");
  });

  it("verifies the retained bytes before download", () => {
    expect(service).toContain('createHash("sha256").update(bytes).digest("hex")');
    expect(service).toContain("Manual snapshot integrity check failed");
    expect(download).toContain('"x-trace-qms-sha256"');
    expect(download).toContain('"cache-control": "private, no-store"');
  });

  it("exposes explicit create/list APIs and does not imply publication", () => {
    expect(api).toContain("export async function GET");
    expect(api).toContain("export async function POST");
    expect(ui).toContain("Generate controlled PDF snapshot");
    expect(ui).toContain("Generating a snapshot does not publish a manual");
    expect(ui).toContain("source status at generation time");
  });
});
