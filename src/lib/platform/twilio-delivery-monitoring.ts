import { Prisma } from "@prisma/client";
import { db } from "../db";
import {
  PlatformIntegrationConfigurationError,
  type PlatformCredentialResolver,
} from "./integration-framework";

const ALLOWED_MESSAGE_STATUSES = new Set([
  "accepted",
  "scheduled",
  "queued",
  "sending",
  "sent",
  "delivered",
  "undelivered",
  "failed",
  "canceled",
  "read",
]);

type PollCandidate = {
  id: string;
  connectionId: string;
  providerObjectId: string;
  providerOutcome: string | null;
  status: "SUCCEEDED" | "RECONCILIATION_REQUIRED";
  credentialRef: string | null;
};

type TwilioCredential = {
  accountSid: string;
  authToken: string;
};

function parseCredential(value: string | null): TwilioCredential {
  if (!value) throw new PlatformIntegrationConfigurationError("Twilio credential bundle is required");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new PlatformIntegrationConfigurationError("Twilio credential bundle is invalid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PlatformIntegrationConfigurationError("Twilio credential bundle must be an object");
  }
  const record = parsed as Record<string, unknown>;
  const accountSid = typeof record.accountSid === "string" ? record.accountSid.trim() : "";
  const authToken = typeof record.authToken === "string" ? record.authToken.trim() : "";
  if (!/^AC[a-fA-F0-9]{32}$/.test(accountSid)) throw new PlatformIntegrationConfigurationError("Twilio account SID is invalid");
  if (!authToken || authToken.length > 256) throw new PlatformIntegrationConfigurationError("Twilio auth token is invalid");
  return { accountSid, authToken };
}

function statusError(value: string) {
  return value.slice(0, 500);
}

async function writeSystemAudit(
  tx: Prisma.TransactionClient,
  action: string,
  deliveryId: string,
  reason: string,
  metadata: Prisma.InputJsonObject,
) {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "PlatformAuditEvent" ("id","action","entityType","entityId","reason","metadata")
    VALUES (gen_random_uuid(),${action},'PlatformIntegrationDelivery',${deliveryId}::uuid,${reason},${JSON.stringify(metadata)}::jsonb)
  `);
}

export class TwilioDeliveryMonitoringService {
  constructor(private readonly credentials: PlatformCredentialResolver) {}

  async pollDue(limit = 25) {
    const bounded = Math.max(1, Math.min(100, Math.trunc(limit)));
    const candidates = await db.$queryRaw<PollCandidate[]>(Prisma.sql`
      SELECT d."id",d."connectionId",d."providerObjectId",d."providerOutcome",d."status"::text AS "status",c."credentialRef"
      FROM "PlatformIntegrationDelivery" d
      JOIN "PlatformIntegrationConnection" c ON c."id"=d."connectionId"
      WHERE c."adapterKey"='twilio.sms'
        AND c."status"='ACTIVE'
        AND d."eventType"='twilio.sms.send'
        AND d."status" IN ('SUCCEEDED','RECONCILIATION_REQUIRED')
        AND d."providerObjectId" ~ '^SM[0-9A-Fa-f]{32}$'
        AND COALESCE(d."providerOutcome",'') NOT IN ('TWILIO_DELIVERED','TWILIO_UNDELIVERED','TWILIO_FAILED','TWILIO_CANCELED','TWILIO_READ')
        AND d."createdAt" < CURRENT_TIMESTAMP - INTERVAL '2 minutes'
        AND (d."providerStatusCheckedAt" IS NULL OR d."providerStatusCheckedAt" < CURRENT_TIMESTAMP - INTERVAL '15 minutes')
      ORDER BY d."providerStatusCheckedAt" NULLS FIRST,d."createdAt"
      LIMIT ${bounded}
    `);

    const results: Array<{ id: string; outcome: string }> = [];
    for (const candidate of candidates) results.push(await this.pollOne(candidate));
    return results;
  }

  private async pollOne(candidate: PollCandidate) {
    let credential: TwilioCredential;
    try {
      credential = parseCredential(await this.credentials.resolve(candidate.credentialRef));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Twilio credential resolution failed";
      await this.recordPollError(candidate, message);
      return { id: candidate.id, outcome: "POLL_ERROR" };
    }

    let response: Response;
    try {
      response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(credential.accountSid)}/Messages/${encodeURIComponent(candidate.providerObjectId)}.json`,
        {
          method: "GET",
          headers: {
            Authorization: `Basic ${Buffer.from(`${credential.accountSid}:${credential.authToken}`, "utf8").toString("base64")}`,
          },
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Twilio status request failed";
      await this.recordPollError(candidate, message);
      return { id: candidate.id, outcome: "POLL_ERROR" };
    }

    if (!response.ok) {
      await this.recordPollError(candidate, `Twilio status request returned HTTP ${response.status}`);
      return { id: candidate.id, outcome: `HTTP_${response.status}` };
    }

    const body = await response.json() as Record<string, unknown>;
    const sid = typeof body.sid === "string" ? body.sid.trim() : "";
    const messageStatus = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";
    if (sid !== candidate.providerObjectId || !ALLOWED_MESSAGE_STATUSES.has(messageStatus)) {
      await this.recordPollError(candidate, "Twilio status response did not match the governed delivery");
      return { id: candidate.id, outcome: "INVALID_PROVIDER_EVIDENCE" };
    }

    const providerOutcome = `TWILIO_${messageStatus.toUpperCase()}`;
    await db.$transaction(async (tx) => {
      const current = await tx.$queryRaw<Array<{
        status: string;
        providerObjectId: string | null;
        providerOutcome: string | null;
        connectionStatus: string;
      }>>(Prisma.sql`
        SELECT d."status"::text AS "status",d."providerObjectId",d."providerOutcome",c."status"::text AS "connectionStatus"
        FROM "PlatformIntegrationDelivery" d
        JOIN "PlatformIntegrationConnection" c ON c."id"=d."connectionId"
        WHERE d."id"=${candidate.id}::uuid
        FOR UPDATE
      `);
      if (current.length !== 1 || current[0].connectionStatus !== "ACTIVE" || current[0].providerObjectId !== candidate.providerObjectId) return;

      const resolveAmbiguity = current[0].status === "RECONCILIATION_REQUIRED";
      if (resolveAmbiguity) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "PlatformIntegrationDelivery"
          SET "status"='SUCCEEDED',
              "providerOutcome"=${providerOutcome},
              "providerStatusCheckedAt"=CURRENT_TIMESTAMP,
              "providerStatusCheckCount"="providerStatusCheckCount"+1,
              "providerStatusError"=NULL,
              "reconciliationReason"='TWILIO_PROVIDER_POLL_CONFIRMED_MESSAGE_EXISTS',
              "deliveredAt"=COALESCE("deliveredAt",CURRENT_TIMESTAMP),
              "lastError"=NULL,
              "claimedAt"=NULL,
              "claimedBy"=NULL,
              "deadLetteredAt"=NULL
          WHERE "id"=${candidate.id}::uuid AND "status"='RECONCILIATION_REQUIRED'
        `);
        await writeSystemAudit(
          tx,
          "platform.integration.delivery.reconciled_by_provider_poll",
          candidate.id,
          "Twilio provider polling confirmed the original Message exists.",
          {
            provider: "twilio",
            messageSid: candidate.providerObjectId,
            messageStatus,
            previousStatus: current[0].status,
            resolution: "CONFIRMED_SUCCEEDED",
          },
        );
      } else {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "PlatformIntegrationDelivery"
          SET "providerOutcome"=${providerOutcome},
              "providerStatusCheckedAt"=CURRENT_TIMESTAMP,
              "providerStatusCheckCount"="providerStatusCheckCount"+1,
              "providerStatusError"=NULL
          WHERE "id"=${candidate.id}::uuid AND "status"='SUCCEEDED'
        `);
        if (current[0].providerOutcome !== providerOutcome) {
          await writeSystemAudit(
            tx,
            "platform.integration.delivery.provider_status_polled",
            candidate.id,
            "Twilio provider status changed during polling.",
            {
              provider: "twilio",
              messageSid: candidate.providerObjectId,
              previousProviderOutcome: current[0].providerOutcome,
              providerOutcome,
            },
          );
        }
      }
    });

    return { id: candidate.id, outcome: providerOutcome };
  }

  private async recordPollError(candidate: PollCandidate, message: string) {
    await db.$transaction(async (tx) => {
      const current = await tx.$queryRaw<Array<{ providerObjectId: string | null }>>(Prisma.sql`
        SELECT "providerObjectId" FROM "PlatformIntegrationDelivery"
        WHERE "id"=${candidate.id}::uuid FOR UPDATE
      `);
      if (current.length !== 1 || current[0].providerObjectId !== candidate.providerObjectId) return;
      await tx.$executeRaw(Prisma.sql`
        UPDATE "PlatformIntegrationDelivery"
        SET "providerStatusCheckedAt"=CURRENT_TIMESTAMP,
            "providerStatusCheckCount"="providerStatusCheckCount"+1,
            "providerStatusError"=${statusError(message)}
        WHERE "id"=${candidate.id}::uuid
      `);
      await writeSystemAudit(
        tx,
        "platform.integration.delivery.provider_status_poll_failed",
        candidate.id,
        "Twilio provider status polling failed without changing delivery retry eligibility.",
        {
          provider: "twilio",
          messageSid: candidate.providerObjectId,
          error: statusError(message),
        },
      );
    });
  }
}
