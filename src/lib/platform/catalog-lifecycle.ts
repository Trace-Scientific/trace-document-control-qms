import { Prisma } from "@prisma/client";
import { db } from "../db";
import { requirePlatformAuthorization, type PlatformAuthorizationContext } from "./authorization";
import { SubscriptionValidationError } from "./subscriptions";

export async function activateFeature(
  context: PlatformAuthorizationContext,
  input: { featureId: string; reason: string },
): Promise<void> {
  requirePlatformAuthorization(context, { permission: "platform.subscription.manage" });
  if (!input.reason.trim() || input.reason.length > 1000) {
    throw new SubscriptionValidationError("A reason between 1 and 1000 characters is required");
  }

  await db.$transaction(async (tx) => {
    const changed = await tx.$executeRaw(Prisma.sql`
      UPDATE "Feature"
      SET "status" = 'ACTIVE', "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${input.featureId}::uuid AND "status" = 'DRAFT'
    `);
    if (changed !== 1) throw new SubscriptionValidationError("Only a draft feature can be activated");

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "PlatformAuditEvent" (
        "id", "actorIdentityId", "actorMembershipId", "action", "entityType", "entityId", "reason", "metadata"
      ) VALUES (
        gen_random_uuid(), ${context.platformIdentityId}::uuid, ${context.platformMembershipId}::uuid,
        'catalog.feature.activated', 'Feature', ${input.featureId}::uuid, ${input.reason.trim()}, '{}'::jsonb
      )
    `);
  });
}