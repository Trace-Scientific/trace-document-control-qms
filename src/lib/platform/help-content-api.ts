import { NextResponse } from "next/server";
import { z } from "zod";
import { PlatformAuthenticationRequiredError } from "./authenticated-request";
import { PlatformAuthorizationError } from "./authorization";
import { HelpContentConflictError, HelpContentNotFoundError, HelpContentValidationError } from "./help-content";

export function respondHelpContentError(error: unknown): NextResponse {
  if (error instanceof PlatformAuthenticationRequiredError) {
    return NextResponse.json({ error: "Platform authentication required" }, { status: 401 });
  }
  if (error instanceof PlatformAuthorizationError) {
    return NextResponse.json({ error: "Platform access denied" }, { status: 403 });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Invalid help content request" }, { status: 422 });
  }
  if (error instanceof HelpContentNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof HelpContentConflictError || error instanceof HelpContentValidationError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  return NextResponse.json({ error: "Help content operation failed" }, { status: 500 });
}
