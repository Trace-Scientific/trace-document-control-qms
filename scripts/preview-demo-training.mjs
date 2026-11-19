import { pathToFileURL } from "node:url";
import { DEMO_TRAINING_COURSES, DEMO_PERSONAS, validateDemoManifest } from "./demo-tenant-manifest.mjs";

// Offline-only preview. No database client, credentials, employee records, or write path.
export function previewDemoTraining() {
  validateDemoManifest();
  const coordinator = DEMO_PERSONAS.find((persona) => persona.key === "training-coordinator");
  if (!coordinator) throw new Error("Synthetic training coordinator is missing");
  // Fictional persona-based scenarios only; no employee IDs, accounts, or records.
  const learners = DEMO_PERSONAS.filter((persona) =>
    ["molecular-technologist", "accessioning-lead"].includes(persona.key)
  );
  if (learners.length !== 2) throw new Error("Synthetic learner personas are missing");
  const scenarios = learners.flatMap((learner) =>
    DEMO_TRAINING_COURSES.map((course) => ({
      learnerPersonaKey: learner.key,
      learnerRole: learner.role,
      courseCode: course.code,
      proposedStatus: "NOT_ASSIGNED",
      sampleCompletion: null,
      evidenceFileId: null,
    }))
  );
  return {
    mode: "offline-preview-only",
    applied: false,
    databaseChanges: 0,
    employeeAccountsCreated: 0,
    assignmentsCreated: 0,
    completionsCreated: 0,
    coordinator: { personaKey: coordinator.key, role: coordinator.role },
    scenarios,
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
