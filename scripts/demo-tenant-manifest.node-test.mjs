import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_DOCUMENTS,
  DEMO_PERSONAS,
  DEMO_TRAINING_COURSES,
  validateDemoManifest,
} from "./demo-tenant-manifest.mjs";

test("demo manifest has stable, unique, synthetic document identifiers", () => {
  const counts = validateDemoManifest();
  assert.deepEqual(counts, {
    sites: 2,
    departments: 4,
    documentTypes: 4,
    documents: 30,
    personas: 6,
    trainingCourses: 2,
  });
  assert.ok(DEMO_DOCUMENTS.every((doc) => doc.documentNumber.startsWith("DEMO-")));
});

test("demo personas have no credentials or real email addresses", () => {
  assert.ok(DEMO_PERSONAS.every((persona) =>
    !("password" in persona) && !("email" in persona) && !("credential" in persona)
  ));
});

test("demo awareness courses have distinct synthetic codes and bounded outlines", () => {
  assert.equal(DEMO_TRAINING_COURSES.length, 2);
  assert.deepEqual(DEMO_TRAINING_COURSES.map((course) => course.code), [
    "DEMO-TRN-HIPAA-001", "DEMO-TRN-BBP-001",
  ]);
  assert.ok(DEMO_TRAINING_COURSES.every((course) =>
    course.code.startsWith("DEMO-") &&
    course.topics.length >= 3 &&
    course.description.includes("Demonstration only") &&
    !("employeeId" in course) &&
    !("assignmentId" in course)
  ));
});
