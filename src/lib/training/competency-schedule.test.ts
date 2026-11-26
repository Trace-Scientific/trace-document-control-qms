import { describe, expect, it } from "vitest";
import { competencySchedule } from "./competency-schedule";

const requirement = {
  today: "2028-03-01",
  requirementEffectiveOn: "2028-02-28",
  initialDueDays: 1,
  firstReassessmentDays: null,
  hasMultipleQualifications: false,
  reassessmentIntervalDays: 365,
  latestAssessment: null,
  lastQualifiedAt: null,
};

describe("competency assessment scheduling", () => {
  it("uses calendar dates and becomes overdue on the day after the deadline", () => {
    expect(competencySchedule(requirement)).toEqual({ kind: "INITIAL", dueOn: "2028-02-29", overdue: true });
    expect(competencySchedule({ ...requirement, today: "2028-02-29" })).toEqual({
      kind: "INITIAL", dueOn: "2028-02-29", overdue: false,
    });
  });

  it("allows an initial assessment due on the effective date", () => {
    expect(competencySchedule({ ...requirement, initialDueDays: 0 })).toEqual({
      kind: "INITIAL", dueOn: "2028-02-28", overdue: true,
    });
  });

  it("leaves existing requirements without a configured initial deadline unscheduled", () => {
    expect(competencySchedule({ ...requirement, initialDueDays: null })).toBeNull();
  });

  it("uses the earlier of the recurring deadline and recorded expiration", () => {
    const assessedAt = "2028-02-27T21:04:00.000Z";
    expect(competencySchedule({
      ...requirement, latestAssessment: { assessedAt, expiresAt: "2028-10-01" }, lastQualifiedAt: assessedAt,
    })).toEqual({ kind: "REASSESSMENT", dueOn: "2028-10-01", overdue: false });
    expect(competencySchedule({
      ...requirement, latestAssessment: { assessedAt, expiresAt: "2030-02-26" }, lastQualifiedAt: assessedAt,
    })).toEqual({ kind: "REASSESSMENT", dueOn: "2029-02-26", overdue: false });
  });

  it("does not postpone a recurring deadline after a later unsuccessful assessment", () => {
    expect(competencySchedule({
      ...requirement,
      latestAssessment: { assessedAt: "2028-02-28T02:00:00.000Z", expiresAt: null },
      lastQualifiedAt: "2027-01-15T02:00:00.000Z",
    })).toEqual({ kind: "REASSESSMENT", dueOn: "2028-01-15", overdue: true });
  });

  it("retains the explicit expiration when there is no recurring policy", () => {
    expect(competencySchedule({
      ...requirement, reassessmentIntervalDays: null,
      latestAssessment: { assessedAt: "2028-01-15", expiresAt: "2029-01-15" },
    })).toEqual({ kind: "REASSESSMENT", dueOn: "2029-01-15", overdue: false });
  });
  it("retains a previous qualification expiration after a later unsuccessful assessment", () => {
    expect(competencySchedule({
      ...requirement,
      latestAssessment: { assessedAt: "2028-02-28", expiresAt: null },
      lastQualifiedAt: "2027-10-01",
      lastQualifiedExpiresAt: "2028-01-15",
    })).toEqual({ kind: "REASSESSMENT", dueOn: "2028-01-15", overdue: true });
  });
  it("uses the configured first interval through unsuccessful reassessments", () => {
    expect(competencySchedule({
      ...requirement, firstReassessmentDays: 180,
      latestAssessment: { assessedAt: "2028-02-20", expiresAt: null }, lastQualifiedAt: "2027-02-01",
    })).toEqual({ kind: "REASSESSMENT", dueOn: "2027-07-31", overdue: true });
  });

  it("switches to the recurring interval after the second qualification", () => {
    const qualifiedAt = "2028-02-01";
    expect(competencySchedule({
      ...requirement, firstReassessmentDays: 180, hasMultipleQualifications: true,
      latestAssessment: { assessedAt: qualifiedAt, expiresAt: null }, lastQualifiedAt: qualifiedAt,
    })).toEqual({ kind: "REASSESSMENT", dueOn: "2029-01-31", overdue: false });
  });
});
