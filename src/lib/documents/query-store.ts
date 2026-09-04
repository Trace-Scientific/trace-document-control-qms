import { db } from "../db";
import type { DocumentQueryStore } from "./query";
export class PrismaDocumentQueryStore implements DocumentQueryStore {
  async list(input: Parameters<DocumentQueryStore["list"]>[0]) {
    return db.documentVersion
      .findMany({
        where: {
          organizationId: input.organizationId,
          status: input.status,
          AND: [
            input.cursor
              ? {
                  OR: [
                    { createdAt: { lt: input.cursor.createdAt } },
                    {
                      createdAt: input.cursor.createdAt,
                      id: { lt: input.cursor.id },
                    },
                  ],
                }
              : {},
            input.query
              ? {
                  OR: [
                    {
                      document: {
                        documentNumber: {
                          contains: input.query,
                          mode: "insensitive",
                        },
                      },
                    },
                    {
                      document: {
                        title: { contains: input.query, mode: "insensitive" },
                      },
                    },
                    {
                      document: {
                        documentType: {
                          name: { contains: input.query, mode: "insensitive" },
                        },
                      },
                    },
                  ],
                }
              : {},
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit,
        select: {
          id: true,
          documentId: true,
          versionNumber: true,
          revisionLabel: true,
          status: true,
          effectiveAt: true,
          reviewDueAt: true,
          createdAt: true,
          document: {
            select: {
              documentNumber: true,
              title: true,
              documentType: { select: { name: true } },
            },
          },
          author: { select: { firstName: true, lastName: true } },
        },
      })
      .then((rows) =>
        rows.map((row) => ({
          id: row.id,
          documentId: row.documentId,
          documentNumber: row.document.documentNumber,
          title: row.document.title,
          type: row.document.documentType.name,
          versionNumber: row.versionNumber,
          revisionLabel: row.revisionLabel,
          status: row.status,
          owner: `${row.author.firstName} ${row.author.lastName}`,
          effectiveAt: row.effectiveAt,
          reviewDueAt: row.reviewDueAt,
          createdAt: row.createdAt,
        })),
      );
  }
  async listTypes(organizationId: string) {
    return db.documentType.findMany({
      where: { organizationId, active: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    });
  }
  async detail(organizationId: string, versionId: string) {
    const selected = await db.documentVersion.findFirst({
      where: { organizationId, id: versionId },
      select: { documentId: true },
    });
    if (!selected) return null;
    const rows = await db.documentVersion.findMany({
      where: { organizationId, documentId: selected.documentId },
      select: {
        id: true,
        documentId: true,
        versionNumber: true,
        revisionLabel: true,
        status: true,
        lockVersion: true,
        contentText: true,
        contentHash: true,
        changeSummary: true,
        effectiveAt: true,
        reviewDueAt: true,
        createdAt: true,
        document: {
          select: {
            documentNumber: true,
            title: true,
            documentType: { select: { name: true } },
          },
        },
        author: { select: { firstName: true, lastName: true } },
        file: {
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            sha256: true,
            status: true,
          },
        },
      },
      orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
    });
    const versions = rows.map((row) => ({
        id: row.id,
        documentId: row.documentId,
        documentNumber: row.document.documentNumber,
        title: row.document.title,
        type: row.document.documentType.name,
        versionNumber: row.versionNumber,
        revisionLabel: row.revisionLabel,
        status: row.status,
        lockVersion: row.lockVersion,
        owner: `${row.author.firstName} ${row.author.lastName}`,
        contentText: row.contentText,
        contentHash: row.contentHash,
        changeSummary: row.changeSummary,
        effectiveAt: row.effectiveAt,
        reviewDueAt: row.reviewDueAt,
        createdAt: row.createdAt,
        file: row.file,
      })),
      versionIds = versions.map((row) => row.id);
    const [tasks, reviewerRows] = await Promise.all([
      db.workflowTask.findMany({
        where: {
          organizationId,
          workflow: {
            entityType: "DocumentVersion",
            entityId: { in: versionIds },
          },
        },
        select: {
          id: true,
          stepKey: true,
          status: true,
          dueAt: true,
          decision: true,
          comments: true,
          createdAt: true,
          workflow: { select: { entityId: true } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.user.findMany({
        where: {
          organizationId,
          status: "ACTIVE",
          roles: {
            some: {
              role: {
                permissions: {
                  some: {
                    permission: {
                      key: { in: ["document.review", "document.approve"] },
                    },
                  },
                },
              },
            },
          },
        },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
    ]);
    const assignments = tasks.map((task) => ({
        id: task.id,
        stepKey: task.stepKey,
        versionId: task.workflow.entityId,
        status: task.status,
        dueAt: task.dueAt,
        decision: task.decision,
        comments: task.comments,
        assignee: task.assignee
          ? {
              id: task.assignee.id,
              name: `${task.assignee.firstName} ${task.assignee.lastName}`,
            }
          : null,
        createdAt: task.createdAt,
      })),
      reviewers = reviewerRows.map((row) => ({
        id: row.id,
        name: `${row.firstName} ${row.lastName}`,
      }));
    return {
      selected: versions.find((row) => row.id === versionId)!,
      versions,
      assignments,
      reviewers,
    };
  }
}
