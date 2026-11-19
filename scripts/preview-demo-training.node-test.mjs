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
