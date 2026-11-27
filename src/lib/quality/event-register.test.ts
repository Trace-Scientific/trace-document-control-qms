import { describe, expect, it } from "vitest";
import { filterQualityEvents, isQualityEventOverdue, type QualityEventView } from "./event-register";

const today = "2026-11-26";
const assigned = {
  eventNumber: "QE-001",
  summary: "Specimen label mismatch",
  severity: "HIGH",
  type: "NONCONFORMANCE",
  status: "INVESTIGATING",
  ownerUserId: "user-1",
  dueAt: "2026-11-25T00:00:00.000Z",
} as const;
const closed = { ...assigned, eventNumber: "QE-002", status: "CLOSED" } as const;
const unassigned = { ...assigned, eventNumber: "QE-003", ownerUserId: null, dueAt: null } as const;
const dueToday = { ...assigned, eventNumber: "QE-004", ownerUserId: "user-2", dueAt: `${today}T00:00:00.000Z` };
const events = [assigned, closed, unassigned, dueToday];

describe("quality event register", () => {
  it.each([
    ["all", ["QE-001", "QE-002", "QE-003", "QE-004"]],
    ["active", ["QE-001", "QE-003", "QE-004"]],
    ["mine", ["QE-001"]],
    ["unassigned", ["QE-003"]],
    ["overdue", ["QE-001"]],
  ] satisfies [QualityEventView, string[]][])("shows the %s view", (view, expected) => {
    const results = filterQualityEvents(events, { view, query: "", status: "", severity: "", type: "", sort: "newest" }, "user-1", today);
    expect(results.map(event => event.eventNumber)).toEqual(expected);
  });

  it("combines search, status, and severity and matches event numbers case-insensitively", () => {
    const filters = { view: "all", query: "  LABEL ", status: "CLOSED", severity: "HIGH", type: "", sort: "newest" } as const;
    expect(filterQualityEvents(events, filters, "user-1", today)).toEqual([closed]);
    expect(filterQualityEvents(events, { ...filters, severity: "LOW" }, "user-1", today)).toEqual([]);
    expect(filterQualityEvents(events, { ...filters, query: "qe-002" }, "user-1", today)).toEqual([closed]);
  });

  it("keeps due-today, undated, and closed events out of the overdue view", () => {
    expect(isQualityEventOverdue(assigned, today)).toBe(true);
    expect(isQualityEventOverdue(dueToday, today)).toBe(false);
    expect(isQualityEventOverdue(unassigned, today)).toBe(false);
    expect(isQualityEventOverdue(closed, today)).toBe(false);
  });

  it("filters by recorded incident type and combines with the active view", () => {
    const qc = { ...dueToday, type: "QC_FAILURE" };
    const filters = { view: "active", query: "", status: "", severity: "", type: "QC_FAILURE", sort: "newest" } as const;
    expect(filterQualityEvents([...events, qc], filters, "user-1", today)).toEqual([qc]);
  });

  it("prioritizes active events by due date or severity and keeps the original register order intact", () => {
    const critical = { ...dueToday, eventNumber: "QE-005", severity: "CRITICAL" } as const;
    const source = [closed, unassigned, critical, assigned];
    const filters = { view: "all", query: "", status: "", severity: "", type: "" } as const;
    expect(filterQualityEvents(source, { ...filters, sort: "due" }, "user-1", today))
      .toEqual([assigned, critical, unassigned, closed]);
    expect(filterQualityEvents(source, { ...filters, sort: "severity" }, "user-1", today))
      .toEqual([critical, assigned, unassigned, closed]);
    expect(source).toEqual([closed, unassigned, critical, assigned]);
  });
});
