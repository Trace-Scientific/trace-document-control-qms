import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkReadiness } from "@/lib/operations/readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await checkReadiness([
    {
      name: "database",
      async check() {
        await db.$queryRaw`SELECT 1`;
      },
    },
  ]);
  return NextResponse.json(result, {
    status: result.status === "ready" ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
