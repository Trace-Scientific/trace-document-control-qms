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
    completionWalkthrough: [
      {
        step: 1,
        action: "Select a synthetic learner and an active demonstration course",
        expectedResult: "Training coordinator can review learner and course eligibility",
        recordCreated: false,
      },
      {
        step: 2,
        action: "Assign the course with an appropriate due date",
        expectedResult: "In an authorized demo only, an assignment would appear as ASSIGNED",
        recordCreated: false,
      },
      {
        step: 3,
        action: "Record completion with a date, result, and optional AVAILABLE evidence file",
        expectedResult: "In an authorized demo only, completion would create an immutable TrainingRecord and mark the assignment COMPLETED",
        recordCreated: false,
      },
      {
        step: 4,
        action: "Review completion history and verify tenant-scoped evidence visibility",
        expectedResult: "Only authorized same-tenant users may view the completion and evidence",
        recordCreated: false,
      },
    ],
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
