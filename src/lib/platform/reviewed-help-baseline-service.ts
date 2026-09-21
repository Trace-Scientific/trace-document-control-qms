import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePlatformAuthorization, type PlatformAuthorizationContext } from "@/lib/platform/authorization";
import { HelpContentValidationError } from "@/lib/platform/help-content";
import { REVIEWED_HELP_BASELINE } from "@/lib/platform/reviewed-help-baseline";

async function audit(tx:Prisma.TransactionClient, context:PlatformAuthorizationContext, action:string, entityType:string, entityId:string, reason:string, metadata:Prisma.InputJsonObject={}) {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "PlatformAuditEvent" ("id","actorIdentityId","actorMembershipId","action","entityType","entityId","reason","metadata")
    VALUES (gen_random_uuid(),${context.platformIdentityId}::uuid,${context.platformMembershipId}::uuid,${action},${entityType},${entityId}::uuid,${reason},${JSON.stringify(metadata)}::jsonb)
  `);
}

export class ReviewedHelpBaselineService {
  async status(context:PlatformAuthorizationContext) {
    requirePlatformAuthorization(context,{permission:"platform.help.manage"});
    const rows=await db.$queryRaw<Array<{slug:string;status:string;publishedRevisionId:string|null}>>(Prisma.sql`
      SELECT "slug","status"::text AS "status","publishedRevisionId" FROM "HelpArticle"
      WHERE "slug" = ANY(${REVIEWED_HELP_BASELINE.map((a)=>a.slug)}::text[])
    `);
    const bySlug=new Map(rows.map((r)=>[r.slug,r]));
    return REVIEWED_HELP_BASELINE.map((article)=>({slug:article.slug,title:article.title,status:bySlug.get(article.slug)?.status ?? "MISSING",published:Boolean(bySlug.get(article.slug)?.publishedRevisionId)}));
  }

  async assemble(context:PlatformAuthorizationContext, reason:string) {
    requirePlatformAuthorization(context,{permission:"platform.help.manage"});
    if(!reason.trim()) throw new HelpContentValidationError("A reason is required");
    return db.$transaction(async(tx)=>{
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('reviewed-help-baseline'))`);
      let created=0,revised=0;
      for(let i=0;i<REVIEWED_HELP_BASELINE.length;i+=1){
        const item=REVIEWED_HELP_BASELINE[i];
        const categoryRows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "HelpCategory" WHERE "code"=${item.categoryCode} LIMIT 1`);
        let categoryId=categoryRows[0]?.id;
        if(!categoryId){
          const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
            INSERT INTO "HelpCategory" ("id","code","name","displayOrder","updatedAt")
            VALUES (gen_random_uuid(),${item.categoryCode},${item.categoryName},${i},CURRENT_TIMESTAMP) RETURNING "id"
          `);
          categoryId=rows[0].id;
        }
        const articles=await tx.$queryRaw<Array<{id:string;status:string}>>(Prisma.sql`SELECT "id","status"::text AS "status" FROM "HelpArticle" WHERE "slug"=${item.slug} FOR UPDATE`);
        let articleId=articles[0]?.id;
        if(!articleId){
          const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
            INSERT INTO "HelpArticle" ("id","categoryId","slug","title","summary","status","updatedAt")
            VALUES (gen_random_uuid(),${categoryId}::uuid,${item.slug},${item.title},${item.summary},'DRAFT',CURRENT_TIMESTAMP) RETURNING "id"
          `);
          articleId=rows[0].id; created+=1;
        }
        const identical=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
          SELECT "id" FROM "HelpArticleRevision" WHERE "articleId"=${articleId}::uuid AND "body"=${item.body} AND "changeSummary"=${item.changeSummary} LIMIT 1
        `);
        if(!identical[0]){
          const next=await tx.$queryRaw<Array<{n:number}>>(Prisma.sql`SELECT COALESCE(MAX("revisionNumber"),0)+1 AS "n" FROM "HelpArticleRevision" WHERE "articleId"=${articleId}::uuid`);
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO "HelpArticleRevision" ("id","articleId","revisionNumber","body","changeSummary","createdByIdentityId","createdByMembershipId")
            VALUES (gen_random_uuid(),${articleId}::uuid,${next[0].n},${item.body},${item.changeSummary},${context.platformIdentityId}::uuid,${context.platformMembershipId}::uuid)
          `);
          revised+=1;
        }
      }
      await audit(tx,context,"help.reviewed_baseline.assembled","HelpArticle",context.platformIdentityId,reason,{articleCount:REVIEWED_HELP_BASELINE.length,created,revised});
      return {articleCount:REVIEWED_HELP_BASELINE.length,created,revised};
    });
  }

  async publish(context:PlatformAuthorizationContext, reason:string) {
    requirePlatformAuthorization(context,{permission:"platform.help.manage"});
    if(!reason.trim()) throw new HelpContentValidationError("A reason is required");
    return db.$transaction(async(tx)=>{
      let published=0;
      for(const item of REVIEWED_HELP_BASELINE){
        const rows=await tx.$queryRaw<Array<{id:string;revisionId:string}>>(Prisma.sql`
          SELECT ha."id",har."id" AS "revisionId" FROM "HelpArticle" ha
          INNER JOIN "HelpArticleRevision" har ON har."articleId"=ha."id"
          WHERE ha."slug"=${item.slug} AND har."body"=${item.body} AND har."changeSummary"=${item.changeSummary}
          ORDER BY har."revisionNumber" DESC LIMIT 1
        `);
        if(!rows[0]) throw new HelpContentValidationError(`Reviewed article ${item.slug} has not been assembled`);
        await tx.$executeRaw(Prisma.sql`
          UPDATE "HelpArticle" SET "status"='PUBLISHED',"publishedRevisionId"=${rows[0].revisionId}::uuid,"publishedAt"=CURRENT_TIMESTAMP,"lockVersion"="lockVersion"+1,"updatedAt"=CURRENT_TIMESTAMP
          WHERE "id"=${rows[0].id}::uuid
        `);
        await audit(tx,context,"help.article.published","HelpArticle",rows[0].id,reason,{slug:item.slug,source:"reviewed-launch-baseline"});
        published+=1;
      }
      return {published};
    });
  }
}
