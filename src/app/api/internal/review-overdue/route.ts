import { NextRequest, NextResponse } from "next/server";
import { PrismaWorkflowReviewStore } from "@/lib/documents/workflow-review-store";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";

const store = new PrismaWorkflowReviewStore();
export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization")))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    return NextResponse.json({ data: { created: await store.notifyAllOverdue(new Date()) } });
  } catch {
    return NextResponse.json({ error: "Unable to monitor overdue reviews" }, { status: 500 });
  }
}
