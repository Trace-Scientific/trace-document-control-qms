import { NextResponse } from "next/server";
import { PlatformAuthenticationRequiredError } from "./authenticated-request";
import { PlatformAuthorizationError } from "./authorization";
import { PlatformIntegrationConfigurationError, PlatformIntegrationConflictError, PlatformIntegrationNotFoundError } from "./integration-framework";

export function respondPlatformIntegrationError(error: unknown) {
  if (error instanceof PlatformAuthenticationRequiredError) return NextResponse.json({ error: "Platform authentication required" }, { status: 401 });
  if (error instanceof PlatformAuthorizationError) return NextResponse.json({ error: "Platform permission denied" }, { status: 403 });
  if (error instanceof PlatformIntegrationNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
  if (error instanceof PlatformIntegrationConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof PlatformIntegrationConfigurationError) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ error: "Integration operation failed" }, { status: 500 });
}
