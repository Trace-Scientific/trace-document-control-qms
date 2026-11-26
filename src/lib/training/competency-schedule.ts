export type CompetencyScheduleSettings = {
  initialDueDays?: number | null;
  firstReassessmentDays?: number | null;
  reassessmentIntervalDays?: number | null;
};

export const competencyScheduleMaxDays = 3650;

type CompetencyScheduleInput = {
  today: string;
  requirementEffectiveOn: string;
  initialDueDays: number | null;
  firstReassessmentDays: number | null;
  hasMultipleQualifications: boolean;
  reassessmentIntervalDays: number | null;
  latestAssessment: { assessedAt: string; expiresAt: string | null } | null;
  lastQualifiedAt: string | null;
  lastQualifiedExpiresAt?: string | null;
};

type CompetencySchedule = {
  kind: "INITIAL" | "REASSESSMENT";
  dueOn: string;
  overdue: boolean;
};

function addCalendarDays(date: string, days: number) {
  const value = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function competencySchedule(input: CompetencyScheduleInput): CompetencySchedule | null {
  if (!input.latestAssessment) {
    if (input.initialDueDays === null) return null;
    const dueOn = addCalendarDays(input.requirementEffectiveOn, input.initialDueDays);
    return { kind: "INITIAL", dueOn, overdue: dueOn < input.today };
  }

  const expiration = input.latestAssessment.expiresAt?.slice(0, 10);
  const qualifiedExpiration = input.lastQualifiedExpiresAt?.slice(0, 10);
  const intervalDays = input.hasMultipleQualifications
    ? input.reassessmentIntervalDays
    : input.firstReassessmentDays ?? input.reassessmentIntervalDays;
  const recurringDueOn = input.lastQualifiedAt && intervalDays !== null
    ? addCalendarDays(input.lastQualifiedAt, intervalDays)
    : null;
  const [dueOn] = [expiration, qualifiedExpiration, recurringDueOn]
    .filter((date): date is string => Boolean(date))
    .sort();
  return dueOn ? { kind: "REASSESSMENT", dueOn, overdue: dueOn < input.today } : null;
}
