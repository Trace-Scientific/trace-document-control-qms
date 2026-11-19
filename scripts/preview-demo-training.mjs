import { pathToFileURL } from "node:url";
import { DEMO_TRAINING_COURSES, DEMO_PERSONAS, validateDemoManifest } from "./demo-tenant-manifest.mjs";

// Offline-only preview. No database client, credentials, employee records, or write path.
export function previewDemoTraining() {
  validateDemoManifest();
  const coordinator = DEMO_PERSONAS.find((persona) => persona.key === "training-coordinator");
  if (!coordinator) throw new Error("Synthetic training coordinator is missing");
  return {
    mode: "offline-preview-only",
    applied: false,
    databaseChanges: 0,
    employeeAccountsCreated: 0,
    assignmentsCreated: 0,
    completionsCreated: 0,
    coordinator: { personaKey: coordinator.key, role: coordinator.role },
    courses: DEMO_TRAINING_COURSES.map(({ code, title, description, topics }) => ({
      code, title, description, topics: [...topics],
    })),
    nextGate: "Owner-approved synthetic demo provisioning, course review, and tenant isolation checks required before any database writes",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) {
    console.error("This command accepts no arguments; no apply or database mode exists");
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(previewDemoTraining(), null, 2));
  }
}
