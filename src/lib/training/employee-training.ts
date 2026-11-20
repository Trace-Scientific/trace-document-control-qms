import type { AuthorizationContext } from "../security/authorization";

/** Deny by default: no employee selector is accepted from the client. */
export function resolveOwnTrainingAssignments(
  context: AuthorizationContext,
  employees: readonly { id: string; status: string }[],
): { id: string } {
  if (context.userState !== "ACTIVE" || employees.length !== 1 || employees[0].status !== "ACTIVE") {
    throw new Error("Access denied");
  }
  return { id: employees[0].id };
}
