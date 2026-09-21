import { Prisma } from "@prisma/client";
import type { AuthorizationContext } from "@/lib/security/authorization";
import { db } from "@/lib/db";

export const HELP_SUPPORT_CATEGORIES = ["GENERAL","ACCESS","DOCUMENTS","TRAINING","QUALITY","LABORATORY","REPORTING","TECHNICAL"] as const;
export type HelpSupportCategory = (typeof HELP_SUPPORT_CATEGORIES)[number];
export const HELP_SUPPORT_PRIORITIES = ["LOW","NORMAL","HIGH"] as const;
export type HelpSupportPriority = (typeof HELP_SUPPORT_PRIORITIES)[number];

export type HelpSupportRequestRecord = { id: string; status: "OPEN" | "ACKNOWLEDGED" | "CLOSED"; submittedAt: Date };
export type HelpSupportRequestHistoryRecord = HelpSupportRequestRecord & { subject: string; category: HelpSupportCategory; priority: HelpSupportPriority; acknowledgedAt: Date | null; closedAt: Date | null };

const SAFE_PAGE_CONTEXTS = new Set(["documents","review-queue","administration","records","personnel","training","quality","laboratory","reporting","help"]);

function boundedText(value: string | undefined | null, max: number) {
  const normalized = value?.trim() || "";
  return normalized ? normalized.slice(0, max) : null;
}

export function sanitizeHelpDiagnosticContext(input: { applicationVersion?: string | null; pageContext?: string | null; browserFamily?: string | null; correlationId?: string | null }) {
  const requestedContext = boundedText(input.pageContext, 120);
  return {
    applicationVersion: boundedText(input.applicationVersion, 120),
    pageContext: requestedContext && SAFE_PAGE_CONTEXTS.has(requestedContext) ? requestedContext : null,
    browserFamily: boundedText(input.browserFamily, 120),
    correlationId: boundedText(input.correlationId, 160),
  };
}

export async function listOwnHelpSupportRequests(context: AuthorizationContext): Promise<HelpSupportRequestHistoryRecord[]> {
  return db.$queryRaw<HelpSupportRequestHistoryRecord[]>(Prisma.sql`
    SELECT "id","subject","category","priority","status"::text AS "status","submittedAt","acknowledgedAt","closedAt"
    FROM "HelpSupportRequest"
    WHERE "organizationId"=${context.organizationId}::uuid AND "submittedByUserId"=${context.userId}::uuid
    ORDER BY "submittedAt" DESC, "id"
    LIMIT 100
  `);
}

export async function createHelpSupportRequest(
  context: AuthorizationContext,
  input: {
    subject: string;
    description: string;
    category: HelpSupportCategory;
    priority: HelpSupportPriority;
    applicationVersion?: string | null;
    pageContext?: string | null;
    browserFamily?: string | null;
    correlationId?: string | null;
  },
): Promise<HelpSupportRequestRecord> {
  const subject = input.subject.trim();
  const description = input.description.trim();
  if (subject.length < 3 || subject.length > 200) throw new HelpSupportRequestValidationError("Subject must be 3-200 characters");
  if (description.length < 10 || description.length > 4000) throw new HelpSupportRequestValidationError("Description must be 10-4000 characters");
  if (!HELP_SUPPORT_CATEGORIES.includes(input.category)) throw new HelpSupportRequestValidationError("Unsupported support category");
  if (!HELP_SUPPORT_PRIORITIES.includes(input.priority)) throw new HelpSupportRequestValidationError("Unsupported support priority");

  const diagnostic = sanitizeHelpDiagnosticContext(input);
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<HelpSupportRequestRecord[]>(Prisma.sql`
      INSERT INTO "HelpSupportRequest" (
        "id","organizationId","submittedByUserId","subject","description","category","priority",
        "applicationVersion","pageContext","browserFamily","correlationId"
      ) VALUES (
        gen_random_uuid(),${context.organizationId}::uuid,${context.userId}::uuid,
        ${subject},${description},${input.category},${input.priority},
        ${diagnostic.applicationVersion},${diagnostic.pageContext},${diagnostic.browserFamily},${diagnostic.correlationId}
      )
      RETURNING "id","status"::text AS "status","submittedAt"
    `);
    const row = rows[0];
    if (!row) throw new Error("Support request could not be created");

    await tx.auditEvent.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: "HELP_SUPPORT_REQUEST_SUBMITTED",
        entityType: "HelpSupportRequest",
        entityId: row.id,
        metadata: {
          category: input.category,
          priority: input.priority,
          pageContext: diagnostic.pageContext,
          applicationVersion: diagnostic.applicationVersion,
          correlationIdPresent: Boolean(diagnostic.correlationId),
        },
      },
    });
    return row;
  });
}

export class HelpSupportRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HelpSupportRequestValidationError";
  }
}
