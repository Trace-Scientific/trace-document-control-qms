import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  PlatformIntegrationConfigurationError,
  type NormalizedInboundEvent,
  type PlatformIntegrationAdapter,
} from "./integration-framework";

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const SIGNATURE_TOLERANCE_SECONDS = 300;

type StripeCredentialBundle = {
  apiKey?: string;
  webhookSecret?: string;
};

type StripeConfiguration = {
  apiVersion?: string;
};

type StripeEvent = {
  id?: string;
  type?: string;
  data?: { object?: unknown };
};

function parseCredentialBundle(raw: string | null): StripeCredentialBundle {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as StripeCredentialBundle;
    return {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : undefined,
      webhookSecret: typeof parsed.webhookSecret === "string" ? parsed.webhookSecret : undefined,
    };
  } catch {
    throw new PlatformIntegrationConfigurationError("Stripe credential bundle is invalid");
  }
}

function parseConfiguration(raw: unknown): StripeConfiguration {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const value = raw as Record<string, unknown>;
  return { apiVersion: typeof value.apiVersion === "string" ? value.apiVersion : undefined };
}

function requireApiKey(bundle: StripeCredentialBundle) {
  if (!bundle.apiKey || !/^sk_(test|live)_/.test(bundle.apiKey)) {
    throw new PlatformIntegrationConfigurationError("Stripe API key is not configured");
  }
  return bundle.apiKey;
}

function requireWebhookSecret(bundle: StripeCredentialBundle) {
  if (!bundle.webhookSecret || !bundle.webhookSecret.startsWith("whsec_")) {
    throw new PlatformIntegrationConfigurationError("Stripe webhook secret is not configured");
  }
  return bundle.webhookSecret;
}

function flattenForm(value: unknown, prefix = "", target = new URLSearchParams()): URLSearchParams {
  if (value === null || value === undefined) return target;
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenForm(item, `${prefix}[${index}]`, target));
    return target;
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const next = prefix ? `${prefix}[${key}]` : key;
      flattenForm(nested, next, target);
    }
    return target;
  }
  if (!prefix) throw new PlatformIntegrationConfigurationError("Stripe request payload must be an object");
  target.append(prefix, String(value));
  return target;
}

function parseStripeSignature(header: string) {
  const parts = header.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const v1 = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || v1.length === 0) throw new PlatformIntegrationConfigurationError("Stripe signature header is invalid");
  return { timestamp, v1 };
}

function verifyStripeSignature(rawBody: string, signatureHeader: string | null, secret: string) {
  if (!signatureHeader) throw new PlatformIntegrationConfigurationError("Stripe-Signature header is required");
  const { timestamp, v1 } = parseStripeSignature(signatureHeader);
  const numericTimestamp = Number(timestamp);
  if (!Number.isFinite(numericTimestamp)) throw new PlatformIntegrationConfigurationError("Stripe signature timestamp is invalid");
  const age = Math.abs(Math.floor(Date.now() / 1000) - numericTimestamp);
  if (age > SIGNATURE_TOLERANCE_SECONDS) throw new PlatformIntegrationConfigurationError("Stripe signature timestamp is outside tolerance");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const valid = v1.some((candidate) => {
    if (!/^[a-f0-9]{64}$/i.test(candidate)) return false;
    const candidateBuffer = Buffer.from(candidate, "hex");
    return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
  });
  if (!valid) throw new PlatformIntegrationConfigurationError("Stripe webhook signature verification failed");
}

function normalizePayload(value: unknown): Prisma.InputJsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Prisma.InputJsonObject;
}

export class StripeBillingAdapter implements PlatformIntegrationAdapter {
  readonly key = "stripe.billing";

  async deliver(input: { eventType: string; payload: unknown; configuration: unknown; credential: string | null; idempotencyKey: string }): Promise<void> {
    const credentials = parseCredentialBundle(input.credential);
    const apiKey = requireApiKey(credentials);
    const configuration = parseConfiguration(input.configuration);

    const routes: Record<string, { method: "POST"; path: string }> = {
      "stripe.customer.create": { method: "POST", path: "/customers" },
      "stripe.subscription.create": { method: "POST", path: "/subscriptions" },
    };
    const route = routes[input.eventType];
    if (!route) throw new PlatformIntegrationConfigurationError("Stripe outbound event type is not supported");

    const response = await fetch(`${STRIPE_API_BASE}${route.path}`, {
      method: route.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": input.idempotencyKey,
        ...(configuration.apiVersion ? { "Stripe-Version": configuration.apiVersion } : {}),
      },
      body: flattenForm(input.payload).toString(),
    });

    if (!response.ok) {
      const body = await response.text();
      let message = `Stripe request failed with status ${response.status}`;
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string } };
        if (parsed.error?.message) message = parsed.error.message;
      } catch {
        // Preserve bounded generic error text only.
      }
      throw new Error(message.slice(0, 500));
    }
  }

  async verifyAndNormalizeWebhook(input: { rawBody: string; headers: Headers; configuration: unknown; credential: string | null }): Promise<NormalizedInboundEvent> {
    const credentials = parseCredentialBundle(input.credential);
    verifyStripeSignature(input.rawBody, input.headers.get("stripe-signature"), requireWebhookSecret(credentials));

    let event: StripeEvent;
    try {
      event = JSON.parse(input.rawBody) as StripeEvent;
    } catch {
      throw new PlatformIntegrationConfigurationError("Stripe webhook body is not valid JSON");
    }
    if (!event.id || !event.type) throw new PlatformIntegrationConfigurationError("Stripe webhook event identity is missing");

    const allowed = new Set([
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
      "invoice.payment_failed",
      "checkout.session.completed",
    ]);
    if (!allowed.has(event.type)) throw new PlatformIntegrationConfigurationError("Stripe webhook event type is not supported");

    return {
      eventType: `stripe.${event.type}`,
      providerEventId: event.id,
      payload: {
        stripeEventId: event.id,
        stripeEventType: event.type,
        object: normalizePayload(event.data?.object),
      },
    };
  }
}
