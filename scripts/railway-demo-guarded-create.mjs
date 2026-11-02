// Deliberately not a CLI entrypoint. No Railway service invokes this module.
// Only an independently authorized caller may pass apply=true in a future reviewed release.
import { attestRailwayDemoRuntime } from "./railway-demo-runtime.mjs";
import { inspectRailwayDemoDatabase } from "./railway-demo-db-preflight.mjs";
import { DEMO_PROVISIONER_SERVICE_ID, DEMO_LOGIN_CODE } from "./railway-demo-provisioning-plan.mjs";

const CONFIRMATION = "CREATE-INACTIVE-SYNTHETIC-TRACE-DEMO-LAB";
const DISPLAY_NAME = "Trace Scientific Demo Laboratory (SYNTHETIC)";
const LEGAL_NAME = "Trace Scientific Demonstration Laboratory - Fictional";

export async function prepareGuardedDemoCreation({ env = process.env, createClient, apply = false, confirmation = "" }) {
  if (apply || confirmation) throw new Error("Demo creation preparation is READ_ONLY; apply is not enabled");
  if (env.DEMO_PROVISIONER_SERVICE_ID !== DEMO_PROVISIONER_SERVICE_ID ||
      env.RAILWAY_SERVICE_ID !== DEMO_PROVISIONER_SERVICE_ID) {
    throw new Error("Demo creation: runtime service is not the pinned dedicated provisioner");
  }
  const { identity, databaseUrl } = attestRailwayDemoRuntime(env, DEMO_PROVISIONER_SERVICE_ID);
  if (typeof createClient !== "function") throw new Error("Demo creation: database client factory required");
  const db = await createClient();
  try {
    const preflight = await inspectRailwayDemoDatabase({
      db, identity, databaseUrl, expectedServiceId: DEMO_PROVISIONER_SERVICE_ID,
    });
    if (preflight.existingOrganization || !preflight.canCreate) {
      throw new Error("Demo creation: target login code already exists or cannot be created");
    }
    return {
      mode: "READ_ONLY", targetLoginCode: DEMO_LOGIN_CODE,
      displayName: DISPLAY_NAME, legalName: LEGAL_NAME,
      plannedActive: false, plannedAuditAction: "DEMO_TENANT_PROVISIONED",
      applyAvailable: false, writesPerformed: 0,
      requiredFutureConfirmation: CONFIRMATION,
      preflight,
    };
  } finally {
    await db.$disconnect();
  }
}
