import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";
import {
  runConfiguredSalesforceCdcWorkerOnce,
  salesforceCdcWorkerEnabled,
} from "@/lib/platform/salesforce-cdc-worker-runtime";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!salesforceCdcWorkerEnabled()) {
    return NextResponse.json(
      { error: "Salesforce CDC worker is disabled" },
      { status: 503 },
    );
  }

  try {
    const data = await runConfiguredSalesforceCdcWorkerOnce();
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "Salesforce CDC worker execution failed" },
      { status: 503 },
    );
  }
}
