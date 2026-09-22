import { Prisma } from "@prisma/client";
import { db } from "../db";
import { requirePlatformAuthorization, type PlatformAuthorizationContext } from "./authorization";

export class PricingAnalysisValidationError extends Error {
  constructor(message:string){super(message);this.name="PricingAnalysisValidationError";}
}

export class CommercialPricingAnalysisService {
  async workspace(context:PlatformAuthorizationContext){
    requirePlatformAuthorization(context,{permission:"platform.subscription.read"});
    const [plans,costs,competitors]=await Promise.all([
      db.$queryRaw<Array<{
        planVersionId:string;planCode:string;planName:string;version:number;status:string;
        billingCadence:string|null;currency:string|null;baseAmountCents:number|null;
      }>>(Prisma.sql`
        SELECT pv."id" AS "planVersionId",p."code" AS "planCode",p."name" AS "planName",
          pv."version",pv."status"::text AS "status",pv."billingCadence"::text AS "billingCadence",
          pv."currency",pv."baseAmountCents"
        FROM "PlanVersion" pv
        INNER JOIN "Plan" p ON p."id"=pv."planId"
        WHERE p."status"<>'RETIRED'
        ORDER BY p."name",pv."version" DESC
      `),
      db.$queryRaw<Array<{
        id:string;planVersionId:string;infrastructureMonthlyCents:number;supportMonthlyCents:number;
        operationsMonthlyCents:number;paymentFeeBasisPoints:number;paymentFixedFeeCents:number;
        onboardingCostCents:number;notes:string|null;assumptionDate:Date;lockVersion:number;
      }>>(Prisma.sql`
        SELECT "id","planVersionId","infrastructureMonthlyCents","supportMonthlyCents",
          "operationsMonthlyCents","paymentFeeBasisPoints","paymentFixedFeeCents",
          "onboardingCostCents","notes","assumptionDate","lockVersion"
        FROM "PlanCostAssumption"
        ORDER BY "assumptionDate" DESC,"createdAt" DESC
      `),
      db.$queryRaw<Array<{
        id:string;competitorName:string;offeringName:string|null;billingCadence:string|null;currency:string|null;
        amountCents:number|null;includedUsers:number|null;sourceLabel:string;sourceUrl:string|null;observedOn:Date;
        notes:string|null;createdAt:Date;
      }>>(Prisma.sql`
        SELECT "id","competitorName","offeringName","billingCadence"::text AS "billingCadence","currency",
          "amountCents","includedUsers","sourceLabel","sourceUrl","observedOn","notes","createdAt"
        FROM "CompetitivePriceObservation"
        ORDER BY "observedOn" DESC,"createdAt" DESC
      `)
    ]);

    const analysis=plans.map(plan=>{
      const cost=costs.find(item=>item.planVersionId===plan.planVersionId) ?? null;
      if(!cost||plan.baseAmountCents==null||!plan.currency||!plan.billingCadence){
        return {...plan,cost,normalizedMonthlyRevenueCents:null,estimatedMonthlyCostCents:null,estimatedMonthlyGrossMarginCents:null,estimatedGrossMarginPercent:null};
      }
      const normalizedMonthlyRevenueCents=
        plan.billingCadence==="MONTHLY"?plan.baseAmountCents:
        plan.billingCadence==="ANNUAL"?Math.round(plan.baseAmountCents/12):
        null;
      if(normalizedMonthlyRevenueCents==null){
        return {...plan,cost,normalizedMonthlyRevenueCents:null,estimatedMonthlyCostCents:null,estimatedMonthlyGrossMarginCents:null,estimatedGrossMarginPercent:null};
      }
      const paymentFee=Math.round(normalizedMonthlyRevenueCents*(cost.paymentFeeBasisPoints/10000))+cost.paymentFixedFeeCents;
      const estimatedMonthlyCostCents=
        cost.infrastructureMonthlyCents+cost.supportMonthlyCents+cost.operationsMonthlyCents+paymentFee;
      const estimatedMonthlyGrossMarginCents=normalizedMonthlyRevenueCents-estimatedMonthlyCostCents;
      const estimatedGrossMarginPercent=normalizedMonthlyRevenueCents===0?null:
        Number(((estimatedMonthlyGrossMarginCents/normalizedMonthlyRevenueCents)*100).toFixed(2));
      return {...plan,cost,normalizedMonthlyRevenueCents,estimatedMonthlyCostCents,estimatedMonthlyGrossMarginCents,estimatedGrossMarginPercent};
    });

    return {analysis,competitors};
  }

  async setCostAssumption(context:PlatformAuthorizationContext,input:{
    planVersionId:string;
    infrastructureMonthlyCents:number;
    supportMonthlyCents:number;
    operationsMonthlyCents:number;
    paymentFeeBasisPoints:number;
    paymentFixedFeeCents:number;
    onboardingCostCents:number;
    assumptionDate:Date;
    notes?:string|null;
    expectedLockVersion?:number|null;
    reason:string;
  }){
    requirePlatformAuthorization(context,{permission:"platform.subscription.manage"});
    validateReason(input.reason);
    validateCosts(input);
    if(Number.isNaN(input.assumptionDate.getTime())) throw new PricingAnalysisValidationError("Assumption date is invalid");
    if(input.notes&&input.notes.trim().length>2000) throw new PricingAnalysisValidationError("Notes must be 2000 characters or fewer");

    return db.$transaction(async tx=>{
      const plan=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
        SELECT "id" FROM "PlanVersion" WHERE "id"=${input.planVersionId}::uuid
      `);
      if(plan.length!==1) throw new PricingAnalysisValidationError("Plan version not found");

      const existing=await tx.$queryRaw<Array<{id:string;lockVersion:number}>>(Prisma.sql`
        SELECT "id","lockVersion" FROM "PlanCostAssumption"
        WHERE "planVersionId"=${input.planVersionId}::uuid FOR UPDATE
      `);

      let id:string;
      if(existing[0]){
        if(input.expectedLockVersion==null||existing[0].lockVersion!==input.expectedLockVersion){
          throw new PricingAnalysisValidationError("Cost assumptions changed since they were loaded");
        }
        const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
          UPDATE "PlanCostAssumption"
          SET "infrastructureMonthlyCents"=${input.infrastructureMonthlyCents},
              "supportMonthlyCents"=${input.supportMonthlyCents},
              "operationsMonthlyCents"=${input.operationsMonthlyCents},
              "paymentFeeBasisPoints"=${input.paymentFeeBasisPoints},
              "paymentFixedFeeCents"=${input.paymentFixedFeeCents},
              "onboardingCostCents"=${input.onboardingCostCents},
              "notes"=${input.notes?.trim()||null},
              "assumptionDate"=${input.assumptionDate},
              "updatedAt"=CURRENT_TIMESTAMP,
              "lockVersion"="lockVersion"+1
          WHERE "id"=${existing[0].id}::uuid
          RETURNING "id"
        `);
        id=rows[0].id;
      }else{
        const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
          INSERT INTO "PlanCostAssumption" (
            "id","planVersionId","infrastructureMonthlyCents","supportMonthlyCents","operationsMonthlyCents",
            "paymentFeeBasisPoints","paymentFixedFeeCents","onboardingCostCents","notes","assumptionDate",
            "createdByIdentityId","createdByMembershipId"
          ) VALUES (
            gen_random_uuid(),${input.planVersionId}::uuid,${input.infrastructureMonthlyCents},
            ${input.supportMonthlyCents},${input.operationsMonthlyCents},${input.paymentFeeBasisPoints},
            ${input.paymentFixedFeeCents},${input.onboardingCostCents},${input.notes?.trim()||null},${input.assumptionDate},
            ${context.platformIdentityId}::uuid,${context.platformMembershipId}::uuid
          )
          RETURNING "id"
        `);
        id=rows[0].id;
      }

      await audit(tx,context,"pricing.cost_assumption.set","PlanCostAssumption",id,input.reason,{
        planVersionId:input.planVersionId,
        assumptionDate:input.assumptionDate.toISOString().slice(0,10)
      });
      return {id};
    });
  }

  async addCompetitorObservation(context:PlatformAuthorizationContext,input:{
    competitorName:string;
    offeringName?:string|null;
    billingCadence?:"MONTHLY"|"ANNUAL"|"CUSTOM"|null;
    currency?:string|null;
    amountCents?:number|null;
    includedUsers?:number|null;
    sourceLabel:string;
    sourceUrl?:string|null;
    observedOn:Date;
    notes?:string|null;
    reason:string;
  }){
    requirePlatformAuthorization(context,{permission:"platform.subscription.manage"});
    validateReason(input.reason);
    validateText(input.competitorName,"Competitor name",240);
    validateText(input.sourceLabel,"Source label",500);
    if(input.currency&&!/^[A-Z]{3}$/.test(input.currency.trim().toUpperCase())) throw new PricingAnalysisValidationError("Currency must be a 3-letter code");
    for(const [label,value] of [["Amount",input.amountCents],["Included users",input.includedUsers]] as const){
      if(value!=null&&(!Number.isInteger(value)||value<0)) throw new PricingAnalysisValidationError(`${label} must be a non-negative integer`);
    }
    if(Number.isNaN(input.observedOn.getTime())) throw new PricingAnalysisValidationError("Observed date is invalid");

    return db.$transaction(async tx=>{
      const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
        INSERT INTO "CompetitivePriceObservation" (
          "id","competitorName","offeringName","billingCadence","currency","amountCents","includedUsers",
          "sourceLabel","sourceUrl","observedOn","notes","createdByIdentityId","createdByMembershipId"
        ) VALUES (
          gen_random_uuid(),${input.competitorName.trim()},${input.offeringName?.trim()||null},
          ${input.billingCadence??null}::"BillingCadence",${input.currency?.trim().toUpperCase()||null},
          ${input.amountCents??null},${input.includedUsers??null},${input.sourceLabel.trim()},
          ${input.sourceUrl?.trim()||null},${input.observedOn},${input.notes?.trim()||null},
          ${context.platformIdentityId}::uuid,${context.platformMembershipId}::uuid
        ) RETURNING "id"
      `);
      await audit(tx,context,"pricing.competitor_observation.created","CompetitivePriceObservation",rows[0].id,input.reason,{
        competitorName:input.competitorName.trim(),observedOn:input.observedOn.toISOString().slice(0,10),sourceLabel:input.sourceLabel.trim()
      });
      return {id:rows[0].id};
    });
  }
}

function validateCosts(input:{infrastructureMonthlyCents:number;supportMonthlyCents:number;operationsMonthlyCents:number;paymentFeeBasisPoints:number;paymentFixedFeeCents:number;onboardingCostCents:number}){
  for(const [label,value] of [
    ["Infrastructure monthly cost",input.infrastructureMonthlyCents],
    ["Support monthly cost",input.supportMonthlyCents],
    ["Operations monthly cost",input.operationsMonthlyCents],
    ["Payment fixed fee",input.paymentFixedFeeCents],
    ["Onboarding cost",input.onboardingCostCents],
  ] as const){
    if(!Number.isInteger(value)||value<0) throw new PricingAnalysisValidationError(`${label} must be a non-negative integer`);
  }
  if(!Number.isInteger(input.paymentFeeBasisPoints)||input.paymentFeeBasisPoints<0||input.paymentFeeBasisPoints>10000){
    throw new PricingAnalysisValidationError("Payment fee basis points must be between 0 and 10000");
  }
}
function validateReason(reason:string){if(!reason.trim()||reason.length>1000) throw new PricingAnalysisValidationError("A reason between 1 and 1000 characters is required");}
function validateText(value:string,label:string,max:number){if(!value.trim()||value.trim().length>max) throw new PricingAnalysisValidationError(`${label} is required and must be ${max} characters or fewer`);}
async function audit(tx:Prisma.TransactionClient,context:PlatformAuthorizationContext,action:string,entityType:string,entityId:string,reason:string,metadata:Record<string,unknown>){
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "PlatformAuditEvent" ("id","actorIdentityId","actorMembershipId","action","entityType","entityId","reason","metadata")
    VALUES (gen_random_uuid(),${context.platformIdentityId}::uuid,${context.platformMembershipId}::uuid,${action},${entityType},${entityId}::uuid,${reason.trim()},${JSON.stringify(metadata)}::jsonb)
  `);
}
