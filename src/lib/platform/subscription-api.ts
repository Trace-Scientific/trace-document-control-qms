import { NextResponse } from "next/server";
import { z } from "zod";
import { PlatformAuthenticationRequiredError } from "./authenticated-request";
import { PlatformAuthorizationError } from "./authorization";
import {
  SubscriptionConflictError,
  SubscriptionNotFoundError,
  SubscriptionValidationError,
} from "./subscriptions";

export function respondSubscriptionError(error: unknown): NextResponse {
  if (error instanceof PlatformAuthenticationRequiredError) {
    return NextResponse.json({ error: "Platform authentication required" }, { status: 401 });
  }
  if (error instanceof PlatformAuthorizationError) {
    return NextResponse.json({ error: "Platform access denied" }, { status: 403 });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Invalid subscription request" }, { status: 422 });
  }
  if (error instanceof SubscriptionNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof SubscriptionConflictError || error instanceof SubscriptionValidationError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  return NextResponse.json({ error: "Subscription operation failed" }, { status: 500 });
}