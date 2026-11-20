import type { AuthorizationContext } from "../security/authorization";
import { requireAuthorization } from "../security/authorization";
import type { TrainingStore } from "./training";
import { DemoQuizValidationError, scoreDemoQuiz } from "./demo-quiz";

/**
 * Read-only administrator assessment preview. No employee submissions or governed
 * completions are recorded until employee-account linkage is independently verified.
 */
export async function previewAssignedDemoQuiz(
  context: AuthorizationContext,
  store: Pick<TrainingStore, "listAssignments" | "listCourses">,
  input: { organizationId: string; assignmentId: string; answers: readonly number[] },
) {
  requireAuthorization(context, { organizationId: input.organizationId, permission: "training.manage" });
  const assignments = await store.listAssignments(input.organizationId);
  const assignment = assignments.find((item) => item.id === input.assignmentId);
  if (!assignment || assignment.organizationId !== input.organizationId) throw new Error("Access denied");
  if (assignment.status !== "ASSIGNED") throw new DemoQuizValidationError("Only active assignments can be previewed");
  const courses = await store.listCourses(input.organizationId);
  const course = courses.find((item) => item.id === assignment.courseId);
  if (!course || course.organizationId !== input.organizationId) throw new Error("Access denied");
  if (!course.active) throw new DemoQuizValidationError("Course is inactive");
  const score = scoreDemoQuiz(course.code, input.answers);
  return { assignmentId: assignment.id, courseCode: course.code, ...score, recorded: false as const };
}
