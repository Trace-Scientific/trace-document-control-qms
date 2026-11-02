#!/usr/bin/env node
// Railway demo tenant provisioner: READ-ONLY preparation stage.
// This entrypoint intentionally cannot apply writes. A separately reviewed
// implementation and explicit authorization are required before provisioning.
import { pathToFileURL } from "node:url";
import { attestRailwayDemoRuntime } from "./railway-demo-runtime.mjs";
import { inspectRailwayDemoDatabase } from "./railway-demo-db-preflight.mjs";

export const DEMO_LOGIN_CODE = "trace-demo-lab";
// Pinned independently to the dedicated Railway demo-only service.
export const DEMO_PROVISIONER_SERVICE_ID = "be0f039a-cfad-46c7-a360-95bf0eeefb8c";

export async function planRailwayDemoProvisioning({ env = process.env, createClient }) {
  const expectedServiceId = DEMO_PROVISIONER_SERVICE_ID;
  if (env.DEMO_PROVISIONER_SERVICE_ID !== expectedServiceId) {
    throw new Error("Demo provisioning: configured service ID differs from pinned approved service");
  }
  if (!expectedServiceId || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(expectedServiceId)) {
    throw new Error("Demo provisioning: dedicated provisioner service ID must be explicitly configured");
  }
  if (env.RAILWAY_SERVICE_ID !== expectedServiceId) {
    throw new Error("Demo provisioning: runtime service does not match approved provisioner");
  }
  const { identity, databaseUrl } = attestRailwayDemoRuntime(env, expectedServiceId);
  if (typeof createClient !== "function") {
    throw new Error("Demo provisioning: database client factory is required");
  }
  const db = await createClient();
  try {
    const preflight = await inspectRailwayDemoDatabase({
      db, identity, databaseUrl, expectedServiceId,
    });
    return {
      ...preflight,
      phase: "PROVISIONING_PLAN_ONLY",
      targetLoginCode: DEMO_LOGIN_CODE,
      plannedOrganizationStatus: "INACTIVE",
      usersToCreate: 0,
      documentsToCreate: 0,
      applyAvailable: false,
      writesPerformed: 0,
    };
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  if (process.argv.length !== 2) {
    throw new Error("Demo provisioning: arguments and apply operations are disabled");
  }
  const { PrismaClient } = await import("@prisma/client");
  const result = await planRailwayDemoProvisioning({
    createClient: () => new PrismaClient(),
  });
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Demo provisioning plan refused:", error.message);
    process.exitCode = 1;
  });
}
