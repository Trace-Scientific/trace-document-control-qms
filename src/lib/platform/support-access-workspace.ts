import { Prisma } from "@prisma/client";
import { db } from "../db";
import type { PlatformAuthorizationContext } from "./authorization";
import { requirePlatformAuthorization } from "./authorization";

export class SupportAccessWorkspaceService {
  async load(context:PlatformAuthorizationContext){
    const canRequest=context.grants.includes("platform.support.request");
    const canApprove=context.grants.includes("platform.support.approve");
    const canAccess=context.grants.includes("platform.support.access");
    if(!canRequest&&!canApprove&&!canAccess){
      requirePlatformAuthorization(context,{permission:"platform.support.request"});
    }

    const [cases,requests,sessions]=await Promise.all([
      canRequest||canApprove||canAccess
        ? db.$queryRaw<Array<{id:string;customerAccountId:string;customerName:string;targetOrganizationId:string;organizationName:string;caseNumber:string;title:string;status:string;openedAt:Date;closedAt:Date|null}>>(Prisma.sql`
            SELECT sc."id",sc."customerAccountId",ca."displayName" AS "customerName",
              sc."targetOrganizationId",o."displayName" AS "organizationName",
              sc."caseNumber",sc."title",sc."status"::text AS "status",sc."openedAt",sc."closedAt"
            FROM "SupportCase" sc
            INNER JOIN "CustomerAccount" ca ON ca."id"=sc."customerAccountId"
            INNER JOIN "Organization" o ON o."id"=sc."targetOrganizationId"
            ORDER BY sc."openedAt" DESC
          `)
        : Promise.resolve([]),
      canRequest||canApprove||canAccess
        ? db.$queryRaw<Array<{id:string;caseId:string;caseNumber:string;organizationName:string;requestedByMembershipId:string;requesterEmail:string;reason:string;status:string;requestedAt:Date;requestedExpiresAt:Date;capabilities:string[]}>>(Prisma.sql`
            SELECT sar."id",sar."caseId",sc."caseNumber",o."displayName" AS "organizationName",
              sar."requestedByMembershipId",u."email" AS "requesterEmail",sar."reason",
              sar."status"::text AS "status",sar."requestedAt",sar."requestedExpiresAt",
              COALESCE(array_agg(sarc."capabilityKey" ORDER BY sarc."capabilityKey") FILTER (WHERE sarc."capabilityKey" IS NOT NULL),ARRAY[]::text[]) AS "capabilities"
            FROM "SupportAccessRequest" sar
            INNER JOIN "SupportCase" sc ON sc."id"=sar."caseId"
            INNER JOIN "Organization" o ON o."id"=sar."targetOrganizationId"
            INNER JOIN "PlatformMembership" pm ON pm."id"=sar."requestedByMembershipId"
            INNER JOIN "PlatformIdentity" pi ON pi."id"=pm."identityId"
            INNER JOIN "User" u ON u."id"=pi."sourceUserId"
            LEFT JOIN "SupportAccessRequestCapability" sarc ON sarc."requestId"=sar."id"
            GROUP BY sar."id",sc."caseNumber",o."displayName",u."email"
            ORDER BY sar."requestedAt" DESC
          `)
        : Promise.resolve([]),
      canApprove||canAccess
        ? db.$queryRaw<Array<{id:string;requestId:string;caseId:string;caseNumber:string;organizationName:string;actorMembershipId:string;actorEmail:string;status:string;issuedAt:Date;expiresAt:Date;endedAt:Date|null;capabilities:string[]}>>(Prisma.sql`
            SELECT ss."id",ss."requestId",ss."caseId",sc."caseNumber",o."displayName" AS "organizationName",
              ss."actorMembershipId",u."email" AS "actorEmail",ss."status"::text AS "status",
              ss."issuedAt",ss."expiresAt",ss."endedAt",
              COALESCE(array_agg(ssc."capabilityKey" ORDER BY ssc."capabilityKey") FILTER (WHERE ssc."capabilityKey" IS NOT NULL),ARRAY[]::text[]) AS "capabilities"
            FROM "SupportSession" ss
            INNER JOIN "SupportCase" sc ON sc."id"=ss."caseId"
            INNER JOIN "Organization" o ON o."id"=ss."targetOrganizationId"
            INNER JOIN "PlatformIdentity" pi ON pi."id"=ss."actorIdentityId"
            INNER JOIN "User" u ON u."id"=pi."sourceUserId"
            LEFT JOIN "SupportSessionCapability" ssc ON ssc."sessionId"=ss."id"
            GROUP BY ss."id",sc."caseNumber",o."displayName",u."email"
            ORDER BY ss."issuedAt" DESC
          `)
        : Promise.resolve([])
    ]);

    return {
      permissions:{canRequest,canApprove,canAccess},
      currentMembershipId:context.platformMembershipId,
      cases,requests,sessions,
    };
  }
}
