#!/usr/bin/env node
// Explicitly read-only. Does not provision or mutate any records.
import { pathToFileURL } from "node:url";
import { attestRailwayDemoRuntime } from "./railway-demo-runtime.mjs";
import { DEMO_RAILWAY } from "./railway-demo-identity.mjs";
import { inspectRailwayDemoDatabase } from "./railway-demo-db-preflight.mjs";

export async function runRailwayDemoPreflight({ env = process.env, createClient }) {
  const { identity, databaseUrl } = attestRailwayDemoRuntime(env, DEMO_RAILWAY.preflightServiceId);
  if (typeof createClient !== "function") {
    throw new Error("Demo preflight: database client factory is required");
  }
  const db = await createClient();
  try {
    return await inspectRailwayDemoDatabase({ db, identity, databaseUrl, expectedServiceId: DEMO_RAILWAY.preflightServiceId });
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error("Demo preflight: no arguments are accepted; this command is read-only");
  }
  const { PrismaClient } = await import("@prisma/client");
  const result = await runRailwayDemoPreflight({
    createClient: () => new PrismaClient(),
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Demo preflight refused:", error.message);
    process.exitCode = 1;
  });
}
