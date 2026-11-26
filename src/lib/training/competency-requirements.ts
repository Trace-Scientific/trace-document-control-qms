import type { CompetencyAssessmentSummary } from "./competency-rollup";

export const competencyRequirementScopes = ["EMPLOYEE", "DEPARTMENT", "JOB"] as const;
export type CompetencyRequirementScope = (typeof competencyRequirementScopes)[number];

export type CompetencyRequirementTarget = { id: string; label: string };
export type CompetencyRequirement = {
  id: string;
  programId: string;
  programLabel: string;
  scope: CompetencyRequirementScope;
  targetId: string;
  targetLabel: string;
};

export type CompetencyRequirementRow = {
  employeeId: string;
  employeeLabel: string;
  programId: string;
  programLabel: string;
  requirementIds: string[];
  assessment: CompetencyAssessmentSummary | null;
  requirementEffectiveOn: string;
  initialDueDays: number | null;
  firstReassessmentDays: number | null;
  hasMultipleQualifications: boolean;
  reassessmentIntervalDays: number | null;
  lastQualifiedAt: string | null;
  lastQualifiedExpiresAt: string | null;
};

export type CompetencyRequirementsView = {
  requirements: CompetencyRequirement[];
  rows: CompetencyRequirementRow[];
  targets: Record<CompetencyRequirementScope, CompetencyRequirementTarget[]>;
};
