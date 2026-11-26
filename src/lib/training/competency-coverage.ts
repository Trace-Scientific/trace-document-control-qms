import type { CompetencyRequirementRow } from "./competency-requirements";
import { competencyRollups } from "./competency-rollup";
import { competencySchedule } from "./competency-schedule";

export function evaluateCompetencyRequirement(row: CompetencyRequirementRow, today: string) {
  return {
    status: row.assessment ? competencyRollups([row.assessment], today)[0].status : "MISSING_INITIAL" as const,
    schedule: competencySchedule({ ...row, today, latestAssessment: row.assessment }),
  };
}

export type CompetencyCoverage = {
  required: number;
  qualified: number;
  missingInitial: number;
  expired: number;
  conditional: number;
  notQualified: number;
  pastDue: number;
};

export function competencyCoverageByEmployee(rows: CompetencyRequirementRow[], today: string) {
  const byEmployee = new Map<string, CompetencyCoverage>();
  for (const row of rows) {
    const counts = byEmployee.get(row.employeeId) ?? {
      required: 0, qualified: 0, missingInitial: 0, expired: 0, conditional: 0, notQualified: 0, pastDue: 0,
    };
    const { status, schedule } = evaluateCompetencyRequirement(row, today);
    counts.required++;
    if (status === "CURRENT" || status === "DUE_SOON") counts.qualified++;
    else if (status === "MISSING_INITIAL") counts.missingInitial++;
    else if (status === "EXPIRED") counts.expired++;
    else if (status === "CONDITIONAL") counts.conditional++;
    else if (status === "NOT_QUALIFIED") counts.notQualified++;
    if (schedule?.overdue) counts.pastDue++;
    byEmployee.set(row.employeeId, counts);
  }
  return Array.from(byEmployee, ([employeeId, counts]) => ({ employeeId, ...counts }));
}
