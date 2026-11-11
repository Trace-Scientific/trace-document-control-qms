import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "../db";
import { DocumentCommandService } from "./service";
import { PrismaDocumentLifecycleStore } from "./prisma-store";
import type { AuthorizationContext } from "../security/authorization";

const expected = "postgresql://trace_qms_test:local_integration_test_only@127.0.0.1:5433/trace_qms_integration_test?schema=public";
const enabled = process.env.RUN_DEMO_FIXTURE_INTEGRATION === "1";
const fixtureRoot = resolve(process.cwd(), "fixtures/demo");

describe.skipIf(!enabled)("demo fixtures through real service and migrated PostgreSQL", () => {
  it("creates six synthetic drafts and authentic audit records in a disposable database", async () => {
    expect(process.env.DATABASE_URL).toBe(expected);
    const identity = await db.$queryRaw<Array<{ name: string; username: string }>>`SELECT current_database() AS name, current_user AS username`;
    expect(identity[0]).toMatchObject({ name: "trace_qms_integration_test", username: "trace_qms_test" });
    const manifest = JSON.parse(readFileSync(resolve(fixtureRoot, "manifest.json"), "utf8")) as {
      documents: Array<{ id: string; title: string; revision: string; path: string }>;
    };
    const org = await db.organization.create({ data: {
      loginCode: "fixture-service-smoke-isolated",
      legalName: "Synthetic Service Test Laboratory",
      displayName: "Synthetic Service Test Laboratory",
      active: false,
    } });
    const actor = await db.user.create({ data: {
      organizationId: org.id, email: "fixture-service-author@example.invalid",
      firstName: "Synthetic", lastName: "Author", status: "ACTIVE",
    } });
    const type = await db.documentType.create({ data: {
      organizationId: org.id, code: "DEMO", name: "Synthetic Demonstration",
    } });
    const context: AuthorizationContext = {
      userId: actor.id, organizationId: org.id, userState: "ACTIVE",
      grants: [{ permission: "document.create", scopeType: "ORGANIZATION", scopeId: null }],
    };
    const service = new DocumentCommandService(new PrismaDocumentLifecycleStore());
    const ids: string[] = [];
    for (const item of manifest.documents) {
      const contentText = readFileSync(resolve(fixtureRoot, item.path), "utf8");
      const created = await service.createDraft(context, {
        organizationId: org.id, documentTypeId: type.id,
        documentNumber: item.id, title: item.title + " — DEMO",
        versionNumber: 1, revisionLabel: item.revision,
        contentHash: createHash("sha256").update(contentText).digest("hex"),
        contentText, changeSummary: "Initial synthetic demo draft",
      });
      expect(created.status).toBe("DRAFT");
      ids.push(created.id);
    }
    expect(ids).toHaveLength(6);
    expect(await db.document.count({ where: { organizationId: org.id } })).toBe(6);
    expect(await db.documentVersion.count({ where: { organizationId: org.id, status: "DRAFT" } })).toBe(6);
    const audits = await db.auditEvent.findMany({ where: {
      organizationId: org.id, action: "DOCUMENT_DRAFT_CREATED",
    } });
    expect(audits).toHaveLength(6);
    expect(new Set(audits.map((event) => event.entityId))).toEqual(new Set(ids));
    const otherOrg = await db.organization.create({ data: {
      loginCode: "fixture-service-other-isolated", legalName: "Other Synthetic Lab",
      displayName: "Other Synthetic Lab", active: false,
    } });
    expect(await db.document.count({ where: { organizationId: otherOrg.id } })).toBe(0);
    await expect(service.createDraft({ ...context, organizationId: otherOrg.id }, {
      organizationId: org.id, documentTypeId: type.id,
      documentNumber: "CROSS-TENANT", title: "Forbidden",
      versionNumber: 1, revisionLabel: "0.1",
      contentHash: "a".repeat(64), contentText: "Synthetic denied",
      changeSummary: "Denied",
    })).rejects.toThrow("Access denied");
    expect(await db.document.count({ where: { organizationId: org.id } })).toBe(6);
    // CI destroys this entire disposable PostgreSQL service after the job.
  }, 60000);
});
