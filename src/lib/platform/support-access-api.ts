import { NextResponse } from "next/server";
import { z } from "zod";
import { PlatformAuthenticationRequiredError } from "./authenticated-request";
import { PlatformAuthorizationError } from "./authorization";
import {
  SupportAccessConflictError,
  SupportAccessNotFoundError,
  SupportAccessValidationError,
  SupportCapabilityDeniedError,
  SupportCustomerOnlyActionError,
  SupportSessionRequiredError,
  SupportTargetOrganizationDeniedError,
} from "./support-access";

export function respondSupportAccessError(error: unknown): NextResponse {
  if (error instanceof PlatformAuthenticationRequiredError) {
    return NextResponse.json({ error: "Platform authentication required" }, { status: 401 });
  }
  if (error instanceof SupportSessionRequiredError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof PlatformAuthorizationError || error instanceof SupportCapabilityDeniedError || error instanceof SupportCustomerOnlyActionError || error instanceof SupportTargetOrganizationDeniedError) {
    return NextResponse.json({ error: "Support access denied" }, { status: 403 });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Invalid support access request" }, { status: 422 });
  }
  if (error instanceof SupportAccessNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof SupportAccessConflictError || error instanceof SupportAccessValidationError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  return NextResponse.json({ error: "Support access operation failed" }, { status: 500 });
}
