import { NextResponse } from "next/server";
import { z } from "zod";
import { PlatformAuthenticationRequiredError } from "./authenticated-request";
import { PlatformAuthorizationError } from "./authorization";
import {
  SalesCommissionConflictError,
  SalesCommissionNotFoundError,
  SalesCommissionValidationError,
} from "./sales-commissions";

export function respondSalesCommissionError(error: unknown): NextResponse {
  if (error instanceof PlatformAuthenticationRequiredError) {
    return NextResponse.json({ error: "Platform authentication required" }, { status: 401 });
  }
  if (error instanceof PlatformAuthorizationError) {
    return NextResponse.json({ error: "Platform access denied" }, { status: 403 });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Invalid sales or commission request" }, { status: 422 });
  }
  if (error instanceof SalesCommissionNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof SalesCommissionConflictError || error instanceof SalesCommissionValidationError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  return NextResponse.json({ error: "Sales or commission operation failed" }, { status: 500 });
}
