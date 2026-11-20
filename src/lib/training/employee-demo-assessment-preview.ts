import type { AuthorizationContext } from "../security/authorization";
import type { TrainingStore } from "./training";
import { DemoQuizValidationError, scoreDemoQuiz } from "./demo-quiz";
import { resolveOwnTrainingAssignments } from "./employee-training";

/** Read-only employee practice scoring; never writes a governed completion. */
export async function previewOwnDemoQuiz(
  context: AuthorizationContext,
  employees: readonly { id: string; status: string }[],
  store: Pick<TrainingStore, "listAssignments" | "listCourses">,
  input: { assignmentId: string; answers: readonly number[] },
) {
  const employee = resolveOwnTrainingAssignments(context, employees);
  const assignments = await store.listAssignments(context.organizationId, employee.id);
  const assignment = assignments.find((item) => item.id === input.assignmentId && item.organizationId === context.organizationId && item.employeeId === employee.id);
  if (!assignment) throw new Error("Access denied");
  if (assignment.status !== "ASSIGNED") throw new DemoQuizValidationError("Only active assignments can be previewed");
  const courses = await store.listCourses(context.organizationId);
  const course = courses.find((item) => item.id === assignment.courseId && item.organizationId === context.organizationId && item.active);
  if (!course) throw new Error("Access denied");
  return { assignmentId: assignment.id, courseCode: course.code, ...scoreDemoQuiz(course.code, input.answers), recorded: false as const };
}
