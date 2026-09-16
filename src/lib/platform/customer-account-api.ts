import { NextResponse } from "next/server";
import { z } from "zod";
import { PlatformAuthenticationRequiredError } from "./authenticated-request";
import { PlatformAuthorizationError } from "./authorization";
import {
  CustomerAccountConflictError,
  CustomerAccountNotFoundError,
  CustomerAccountTransitionError,
  CustomerAccountValidationError,
} from "./customer-accounts";

export function respondCustomerAccountError(error: unknown): NextResponse {
  if (error instanceof PlatformAuthenticationRequiredError) {
    return NextResponse.json({ error: "Platform authentication required" }, { status: 401 });
  }
  if (error instanceof PlatformAuthorizationError) {
    return NextResponse.json({ error: "Platform access denied" }, { status: 403 });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Invalid customer account request" }, { status: 422 });
  }
  if (error instanceof CustomerAccountNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (
    error instanceof CustomerAccountConflictError ||
    error instanceof CustomerAccountTransitionError ||
    error instanceof CustomerAccountValidationError
  ) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  return NextResponse.json({ error: "Customer account operation failed" }, { status: 500 });
}