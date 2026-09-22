import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { requirePlatformAuthorization, type PlatformAuthorizationContext } from "./authorization";
import { SubscriptionValidationError } from "./subscriptions";

export type BillingProviderEntityType = "CUSTOMER" | "SUBSCRIPTION";

export class BillingProviderLinkService {
  async list(context: PlatformAuthorizationContext) {
    requirePlatformAuthorization(context, { permission: "platform.integration.manage" });
    return db.$queryRaw<Array<{
      id:string;connectionId:string;adapterKey:string;connectionName:string;entityType:BillingProviderEntityType;
      customerAccountId:string|null;subscriptionId:string|null;providerObjectId:string;reason:string;createdAt:Date;
      revokedAt:Date|null;revocationReason:string|null;
    }>>(Prisma.sql`
      SELECT bpl."id",bpl."connectionId",c."adapterKey",c."displayName" AS "connectionName",
        bpl."entityType"::text AS "entityType",bpl."customerAccountId",bpl."subscriptionId",
        bpl."providerObjectId",bpl."reason",bpl."createdAt",bpl."revokedAt",bpl."revocationReason"
      FROM "BillingProviderLink" bpl
      INNER JOIN "PlatformIntegrationConnection" c ON c."id"=bpl."connectionId"
      ORDER BY bpl."createdAt" DESC
    `);
  }

  async create(context: PlatformAuthorizationContext, input: {
    connectionId:string;
    entityType:BillingProviderEntityType;
    customerAccountId?:string;
    subscriptionId?:string;
    providerObjectId:string;
    reason:string;
  }) {
    requirePlatformAuthorization(context, { permission: "platform.integration.manage" });
    const reason=requireReason(input.reason);
    const providerObjectId=requireProviderObjectId(input.entityType,input.providerObjectId);
    return db.$transaction(async(tx)=>{
      const connections=await tx.$queryRaw<Array<{adapterKey:string}>>(Prisma.sql`
        SELECT "adapterKey" FROM "PlatformIntegrationConnection"
        WHERE "id"=${input.connectionId}::uuid AND "status"='ACTIVE'
      `);
      if(connections.length!==1) throw new SubscriptionValidationError("Billing provider connection must be active");
      if(connections[0].adapterKey!=="stripe.billing") throw new SubscriptionValidationError("This billing linkage slice supports the reviewed stripe.billing adapter only");

      if(input.entityType==="CUSTOMER"){
        if(!input.customerAccountId||input.subscriptionId) throw new SubscriptionValidationError("Customer billing link requires only customerAccountId");
        const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
          INSERT INTO "BillingProviderLink" (
            "connectionId","entityType","customerAccountId","providerObjectId",
            "createdByIdentityId","createdByMembershipId","reason"
          )
          SELECT ${input.connectionId}::uuid,'CUSTOMER',ca."id",${providerObjectId},
            ${context.platformIdentityId}::uuid,${context.platformMembershipId}::uuid,${reason}
          FROM "CustomerAccount" ca WHERE ca."id"=${input.customerAccountId}::uuid
          RETURNING "id"
        `);
        if(rows.length!==1) throw new SubscriptionValidationError("Customer account not found");
        await audit(tx,context,"billing.provider_link.created",rows[0].id,reason,{entityType:"CUSTOMER",customerAccountId:input.customerAccountId,providerObjectId,connectionId:input.connectionId});
        return rows[0];
      }

      if(!input.subscriptionId||input.customerAccountId) throw new SubscriptionValidationError("Subscription billing link requires only subscriptionId");
      const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
        INSERT INTO "BillingProviderLink" (
          "connectionId","entityType","subscriptionId","providerObjectId",
          "createdByIdentityId","createdByMembershipId","reason"
        )
        SELECT ${input.connectionId}::uuid,'SUBSCRIPTION',s."id",${providerObjectId},
          ${context.platformIdentityId}::uuid,${context.platformMembershipId}::uuid,${reason}
        FROM "Subscription" s WHERE s."id"=${input.subscriptionId}::uuid
        RETURNING "id"
      `);
      if(rows.length!==1) throw new SubscriptionValidationError("Subscription not found");
      await audit(tx,context,"billing.provider_link.created",rows[0].id,reason,{entityType:"SUBSCRIPTION",subscriptionId:input.subscriptionId,providerObjectId,connectionId:input.connectionId});
      return rows[0];
    });
  }

  async revoke(context: PlatformAuthorizationContext, input:{linkId:string;reason:string}) {
    requirePlatformAuthorization(context, { permission: "platform.integration.manage" });
    const reason=requireReason(input.reason);
    return db.$transaction(async(tx)=>{
      const changed=await tx.$executeRaw(Prisma.sql`
        UPDATE "BillingProviderLink"
        SET "revokedAt"=CURRENT_TIMESTAMP,
          "revokedByIdentityId"=${context.platformIdentityId}::uuid,
          "revokedByMembershipId"=${context.platformMembershipId}::uuid,
          "revocationReason"=${reason}
        WHERE "id"=${input.linkId}::uuid AND "revokedAt" IS NULL
      `);
      if(changed!==1) throw new SubscriptionValidationError("Active billing provider link not found");
      await audit(tx,context,"billing.provider_link.revoked",input.linkId,reason,{});
      return {id:input.linkId,revoked:true};
    });
  }
}

export async function recordVerifiedStripeBillingObservation(tx: Prisma.TransactionClient, input:{
  connectionId:string;
  receiptId:string;
  providerEventId:string|null;
  eventType:string;
  payload:Prisma.InputJsonObject;
}) {
  if(!input.eventType.startsWith("stripe.")) return;
  const object=(input.payload.object && typeof input.payload.object==="object" && !Array.isArray(input.payload.object))
    ? input.payload.object as Record<string,unknown> : {};
  const providerObjectId=typeof object.id==="string" ? object.id.slice(0,500) : null;
  const candidateIds=[
    providerObjectId,
    typeof object.subscription==="string" ? object.subscription.slice(0,500) : null,
    typeof object.customer==="string" ? object.customer.slice(0,500) : null,
  ].filter((value):value is string=>Boolean(value));
  let linkedBillingProviderLinkId:string|null=null;
  if(candidateIds.length){
    const links=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
      SELECT "id" FROM "BillingProviderLink"
      WHERE "connectionId"=${input.connectionId}::uuid
        AND "revokedAt" IS NULL
        AND "providerObjectId" = ANY(${candidateIds}::text[])
      ORDER BY "createdAt" DESC LIMIT 1
    `);
    linkedBillingProviderLinkId=links[0]?.id ?? null;
  }
  const payloadSha256=createHash("sha256").update(JSON.stringify(input.payload)).digest("hex");
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "BillingProviderEventObservation" (
      "receiptId","connectionId","providerEventId","eventType","providerObjectId","linkedBillingProviderLinkId","payloadSha256"
    ) VALUES (
      ${input.receiptId}::uuid,${input.connectionId}::uuid,${input.providerEventId},
      ${input.eventType},${providerObjectId},${linkedBillingProviderLinkId}::uuid,${payloadSha256}
    )
  `);
}

function requireReason(value:string){
  const reason=value.trim();
  if(!reason||reason.length>1000) throw new SubscriptionValidationError("A reason between 1 and 1000 characters is required");
  return reason;
}

function requireProviderObjectId(entityType:BillingProviderEntityType,value:string){
  const id=value.trim();
  const valid=entityType==="CUSTOMER" ? /^cus_[A-Za-z0-9]+$/.test(id) : /^sub_[A-Za-z0-9]+$/.test(id);
  if(!valid) throw new SubscriptionValidationError(entityType==="CUSTOMER" ? "Stripe customer ID must begin with cus_" : "Stripe subscription ID must begin with sub_");
  return id.slice(0,500);
}

async function audit(tx:Prisma.TransactionClient,context:PlatformAuthorizationContext,action:string,entityId:string,reason:string,metadata:Prisma.InputJsonObject){
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "PlatformAuditEvent" ("id","actorIdentityId","actorMembershipId","action","entityType","entityId","reason","metadata")
    VALUES (gen_random_uuid(),${context.platformIdentityId}::uuid,${context.platformMembershipId}::uuid,
      ${action},'BillingProviderLink',${entityId}::uuid,${reason},${JSON.stringify(metadata)}::jsonb)
  `);
}
