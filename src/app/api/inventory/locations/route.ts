import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { listReceiptLocations } from "@/lib/inventory/receipt-location-directory";

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    const data = await listReceiptLocations(context);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Access denied") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to load receipt locations." }, { status: 500 });
  }
}
