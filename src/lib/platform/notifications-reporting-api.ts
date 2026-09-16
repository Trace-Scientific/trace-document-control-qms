import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { PlatformAuthorizationError } from "./authorization";
import { PlatformAuthenticationRequiredError } from "./authenticated-request";
import {
  PlatformNotificationConflictError,
  PlatformNotificationNotFoundError,
  PlatformNotificationValidationError,
} from "./notifications-reporting";

export function respondPlatformNotificationReportingError(error: unknown): NextResponse {
  if (error instanceof PlatformAuthenticationRequiredError) {
    return NextResponse.json({ error: "Platform authentication required" }, { status: 401 });
  }
  if (error instanceof PlatformAuthorizationError) {
    return NextResponse.json({ error: "Platform permission denied" }, { status: 403 });
  }
  if (error instanceof PlatformNotificationNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof PlatformNotificationConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof PlatformNotificationValidationError || error instanceof ZodError) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 });
  }
  console.error("Platform notification/reporting request failed", error);
  return NextResponse.json({ error: "Platform notification/reporting request failed" }, { status: 500 });
}
