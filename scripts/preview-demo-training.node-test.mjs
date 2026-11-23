import assert from "node:assert/strict";
import test from "node:test";
import { previewDemoTraining } from "./preview-demo-training.mjs";

test("training preview is offline and non-mutating", () => {
  const preview = previewDemoTraining();
  assert.equal(preview.mode, "offline-preview-only");
  assert.equal(preview.applied, false);
  assert.equal(preview.databaseChanges, 0);
  assert.equal(preview.employeeAccountsCreated, 0);
  assert.equal(preview.assignmentsCreated, 0);
  assert.equal(preview.completionsCreated, 0);
  assert.equal(preview.coordinator.personaKey, "training-coordinator");
  assert.deepEqual(preview.courses.map(({ code }) => code), [
    "DEMO-TRN-HIPAA-001", "DEMO-TRN-BBP-001",
  ]);
  assert.ok(preview.courses.every((course) => course.topics.length >= 3));
});

test("offline enrollment scenarios are proposed only and contain no completion evidence", () => {
  const preview = previewDemoTraining();
  assert.equal(preview.scenarios.length, 4);
  assert.deepEqual(new Set(preview.scenarios.map((scenario) => scenario.learnerPersonaKey)), new Set([
    "molecular-technologist", "accessioning-lead",
  ]));
  assert.ok(preview.scenarios.every((scenario) =>
    scenario.proposedStatus === "NOT_ASSIGNED" &&
    scenario.sampleCompletion === null &&
    scenario.evidenceFileId === null &&
    !("employeeId" in scenario) &&
    !("assignmentId" in scenario)
  ));
});

test("completion walkthrough explains governed lifecycle without fabricating records", () => {
  const preview = previewDemoTraining();
  assert.deepEqual(preview.completionWalkthrough.map((step) => step.step), [1, 2, 3, 4, 5]);
  assert.ok(preview.completionWalkthrough.every((step) => step.recordCreated === false));
  assert.equal(preview.completionsCreated, 0);
  assert.ok(preview.completionWalkthrough[2].expectedResult.includes("immutable TrainingRecord"));
  assert.ok(preview.completionWalkthrough[3].expectedResult.includes("same-tenant"));
  assert.ok(preview.completionWalkthrough[4].action.includes("Print certificate"));
  assert.ok(preview.completionWalkthrough[4].expectedResult.includes("reference from the official completion"));
});
