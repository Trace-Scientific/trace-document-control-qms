import { expect, it } from "vitest";
import type { CompetencyRequirementRow } from "./competency-requirements";
import { competencyCoverageByEmployee } from "./competency-coverage";

const today = "2026-06-15";
function requirement(programId: string, overrides: Partial<CompetencyRequirementRow> = {}): CompetencyRequirementRow {
  return {
    employeeId: "employee-a", employeeLabel: "Synthetic Employee", programId, programLabel: programId,
    requirementIds: ["role-rule", "direct-rule"], assessment: null, requirementEffectiveOn: "2026-06-01",
    initialDueDays: 5, firstReassessmentDays: null, reassessmentIntervalDays: 365,
    hasMultipleQualifications: false, lastQualifiedAt: null, lastQualifiedExpiresAt: null, ...overrides,
  };
}
function assessed(programId: string, outcome: "QUALIFIED" | "NOT_QUALIFIED" | "CONDITIONAL", expiresAt: string | null) {
  return requirement(programId, { assessment: {
    id: programId, employeeId: "employee-a", programId, outcome, assessedAt: "2026-06-02T00:00:00Z", expiresAt,
  } });
}

it("counts each required pair once and keeps deadlines separate from qualification status", () => {
  const rows = [
    requirement("missing"),
    assessed("expired", "QUALIFIED", "2026-06-10"),
    assessed("due-soon", "QUALIFIED", "2026-06-30"),
    assessed("conditional", "CONDITIONAL", null),
    assessed("not-qualified", "NOT_QUALIFIED", null),
    requirement("another-employee", { employeeId: "employee-b", initialDueDays: null }),
  ];
  expect(competencyCoverageByEmployee(rows, today)).toEqual([
    { employeeId: "employee-a", required: 5, qualified: 1, missingInitial: 1, expired: 1, conditional: 1, notQualified: 1, pastDue: 2 },
    { employeeId: "employee-b", required: 1, qualified: 0, missingInitial: 1, expired: 0, conditional: 0, notQualified: 0, pastDue: 0 },
  ]);
});

it("counts a current qualification with a past-due reassessment in both applicable columns", () => {
  const row = assessed("current", "QUALIFIED", null);
  expect(competencyCoverageByEmployee([{
    ...row, lastQualifiedAt: "2026-06-02", firstReassessmentDays: 7,
  }], today)[0]).toMatchObject({ qualified: 1, pastDue: 1 });
});
