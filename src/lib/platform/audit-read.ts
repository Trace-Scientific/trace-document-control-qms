import { Prisma } from "@prisma/client";
import { db } from "../db";
import { requirePlatformAuthorization, type PlatformAuthorizationContext } from "./authorization";

export interface PlatformAuditQuery {
  action?: string | null;
  entityType?: string | null;
  actorIdentityId?: string | null;
  from?: Date | null;
  to?: Date | null;
  cursorOccurredAt?: Date | null;
  cursorId?: string | null;
  limit?: number;
}

export interface PlatformAuditRecord {
  id: string;
  actorIdentityId: string | null;
  actorMembershipId: string | null;
  actorEmail: string | null;
  occurredAt: Date;
  action: string;
  entityType: string;
  entityId: string | null;
  entityVersion: string | null;
  correlationId: string | null;
  requestId: string | null;
  reason: string | null;
  metadata: unknown;
}

export class PlatformAuditReadService {
  async list(context: PlatformAuthorizationContext, query: PlatformAuditQuery) {
    requirePlatformAuthorization(context, { permission: "platform.audit.read" });

    const limit=Math.max(1,Math.min(200,Math.trunc(query.limit ?? 100)));
    const action=query.action?.trim() || null;
    const entityType=query.entityType?.trim() || null;

    const rows=await db.$queryRaw<PlatformAuditRecord[]>(Prisma.sql`
      SELECT pae."id",pae."actorIdentityId",pae."actorMembershipId",u."email" AS "actorEmail",
        pae."occurredAt",pae."action",pae."entityType",pae."entityId",pae."entityVersion",
        pae."correlationId",pae."requestId",pae."reason",pae."metadata"
      FROM "PlatformAuditEvent" pae
      LEFT JOIN "PlatformIdentity" pi ON pi."id"=pae."actorIdentityId"
      LEFT JOIN "User" u ON u."id"=pi."sourceUserId"
      WHERE (${action}::text IS NULL OR pae."action" ILIKE '%' || ${action} || '%')
        AND (${entityType}::text IS NULL OR pae."entityType"=${entityType})
        AND (${query.actorIdentityId ?? null}::uuid IS NULL OR pae."actorIdentityId"=${query.actorIdentityId ?? null}::uuid)
        AND (${query.from ?? null}::timestamptz IS NULL OR pae."occurredAt">=${query.from ?? null})
        AND (${query.to ?? null}::timestamptz IS NULL OR pae."occurredAt"<${query.to ?? null})
        AND (
          ${query.cursorOccurredAt ?? null}::timestamptz IS NULL
          OR (pae."occurredAt",pae."id") < (${query.cursorOccurredAt ?? null},${query.cursorId ?? null}::uuid)
        )
      ORDER BY pae."occurredAt" DESC,pae."id" DESC
      LIMIT ${limit + 1}
    `);

    const hasMore=rows.length>limit;
    const data=hasMore?rows.slice(0,limit):rows;
    const last=data[data.length-1] ?? null;

    const facets=await db.$transaction(async(tx)=>{
      const [actions,entityTypes]=await Promise.all([
        tx.$queryRaw<Array<{value:string;count:bigint}>>(Prisma.sql`
          SELECT "action" AS "value",COUNT(*)::bigint AS "count"
          FROM "PlatformAuditEvent" GROUP BY "action" ORDER BY COUNT(*) DESC,"action" LIMIT 100
        `),
        tx.$queryRaw<Array<{value:string;count:bigint}>>(Prisma.sql`
          SELECT "entityType" AS "value",COUNT(*)::bigint AS "count"
          FROM "PlatformAuditEvent" GROUP BY "entityType" ORDER BY COUNT(*) DESC,"entityType" LIMIT 100
        `)
      ]);
      return {
        actions:actions.map(x=>({value:x.value,count:Number(x.count)})),
        entityTypes:entityTypes.map(x=>({value:x.value,count:Number(x.count)})),
      };
    });

    return {
      data,
      facets,
      nextCursor:hasMore&&last?{occurredAt:last.occurredAt.toISOString(),id:last.id}:null,
    };
  }
}
