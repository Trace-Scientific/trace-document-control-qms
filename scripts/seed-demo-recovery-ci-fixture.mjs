import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/security/crypto.ts";

const databaseUrl = "postgresql://postgres:postgres@localhost:5432/trace_qms";
if (process.env.CI !== "true" || process.env.DATABASE_URL !== databaseUrl) {
  throw new Error("Restore fixture setup requires the disposable GitHub Actions database");
}
const password = process.env.RESTORE_DEMO_PASSWORD;
if (!password) throw new Error("Missing generated fixture password");
const passwordHash = hashPassword(password);
const contentText = "Synthetic document used to verify recovery.";
const filePath = process.env.RESTORE_FILE_FIXTURE_PATH;
if (!filePath) throw new Error("Missing synthetic file fixture path");
const fileBytes = await readFile(filePath);
if (!fileBytes.length) throw new Error("Synthetic file fixture is empty");
const fileHash = createHash("sha256").update(fileBytes).digest("hex");
const fileId = "502d9cb2-2280-4f80-899e-e9a45f664101";
const db = new PrismaClient({ datasourceUrl: databaseUrl });

try {
  await db.$transaction(async (tx) => {
    const { id: organizationId } = await tx.organization.create({
      data: {
        id: "32e089a4-1deb-4db1-aa29-6c9b12e3ceb1",
        loginCode: "trace-demo-lab",
        legalName: "Synthetic Recovery Test Laboratory",
        displayName: "Synthetic Recovery Test Laboratory",
      },
    });
    const user = await tx.user.create({
      data: { organizationId, email: "alex.morgan@example.com", firstName: "Alex", lastName: "Morgan" },
    });
    await tx.credential.create({ data: { organizationId, userId: user.id, passwordHash } });
    const role = await tx.role.create({ data: { organizationId, name: "Recovery fixture reader" } });
    const permission = await tx.permission.upsert({
      where: { key: "document.read" },
      create: { key: "document.read" },
      update: {},
    });
    await tx.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await tx.userRole.create({ data: { organizationId, userId: user.id, roleId: role.id } });
    const documentType = await tx.documentType.create({
      data: { organizationId, code: "TEST", name: "Recovery fixture" },
    });
    const document = await tx.document.create({
      data: {
        organizationId, documentTypeId: documentType.id, documentNumber: "TEST-001",
        title: "QMS Workflow Verification — Demo",
      },
    });
    await tx.fileObject.create({
      data: {
        id: fileId,
        organizationId,
        storageKey: `${organizationId}/${fileId}/recovery-fixture.txt`,
        originalName: "recovery-fixture.txt",
        mimeType: "text/plain",
        sizeBytes: BigInt(fileBytes.length),
        sha256: fileHash,
        status: "AVAILABLE",
        uploadedByUserId: user.id,
      },
    });
    await tx.documentVersion.create({
      data: {
        organizationId, documentId: document.id, authoredByUserId: user.id, versionNumber: 1,
        revisionLabel: "0.1", changeSummary: "Synthetic recovery fixture", contentText,
        contentHash: createHash("sha256").update(contentText).digest("hex"),
      },
    });
  });
} finally {
  await db.$disconnect();
}
