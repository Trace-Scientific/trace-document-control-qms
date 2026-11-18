// Deliberately not a CLI entrypoint. No Railway service invokes this module.
// Apply operations are disabled.
import { attestRailwayDemoRuntime } from "./railway-demo-runtime.mjs";
import { inspectRailwayDemoDatabase, inspectRailwayIsolationDemoDatabase } from "./railway-demo-db-preflight.mjs";
import { inspectDemoProvisionerRole } from "./railway-demo-provisioner-role-gate.mjs";
import { DEMO_PROVISIONER_SERVICE_ID } from "./railway-demo-provisioning-plan.mjs";
import {
  ISOLATION_DEMO_CREATE_CONFIRMATION,
  ISOLATION_DEMO_DISPLAY_NAME,
  ISOLATION_DEMO_LEGAL_NAME,
} from "./railway-demo-create-transaction.mjs";

const CONFIRMATION = "CREATE-INACTIVE-SYNTHETIC-TRACE-DEMO-LAB";
const DISPLAY_NAME = "Trace Scientific Demo Laboratory (SYNTHETIC)";
const LEGAL_NAME = "Trace Scientific Demonstration Laboratory - Fictional";

export function prepareGuardedDemoCreation(options = {}) {
  return prepareCreation(options, inspectRailwayDemoDatabase, {
    displayName: DISPLAY_NAME, legalName: LEGAL_NAME, requiredFutureConfirmation: CONFIRMATION,
  });
}

export function prepareGuardedIsolationDemoCreation(options = {}) {
  return prepareCreation(options, inspectRailwayIsolationDemoDatabase, {
    displayName: ISOLATION_DEMO_DISPLAY_NAME,
    legalName: ISOLATION_DEMO_LEGAL_NAME,
    requiredFutureConfirmation: ISOLATION_DEMO_CREATE_CONFIRMATION,
  });
}

async function prepareCreation({ env = process.env, createClient, apply = false, confirmation = "" }, inspectDatabase, plan) {
  if (apply || confirmation) throw new Error("Demo creation preparation is READ_ONLY; apply is not enabled");
  if (env.DEMO_PROVISIONER_SERVICE_ID !== DEMO_PROVISIONER_SERVICE_ID ||
      env.RAILWAY_SERVICE_ID !== DEMO_PROVISIONER_SERVICE_ID) {
    throw new Error("Demo creation: runtime service is not the pinned dedicated provisioner");
  }
  const { identity, databaseUrl } = attestRailwayDemoRuntime(env, DEMO_PROVISIONER_SERVICE_ID);
  if (typeof createClient !== "function") throw new Error("Demo creation: database client factory required");
  const db = await createClient();
  try {
    const roleCheck = await inspectDemoProvisionerRole(db);
    const preflight = await inspectDatabase({
      db, identity, databaseUrl, expectedServiceId: DEMO_PROVISIONER_SERVICE_ID,
    });
    if (preflight.existingOrganization || !preflight.canCreate) {
      throw new Error("Demo creation: target login code already exists or cannot be created");
    }
    return {
      mode: "READ_ONLY", targetLoginCode: preflight.proposedLoginCode,
      ...plan,
      plannedActive: false, plannedAuditAction: "DEMO_TENANT_PROVISIONED",
      applyAvailable: false, writesPerformed: 0,
      roleCheck, preflight,
    };
  } finally {
    await db.$disconnect();
  }
}
