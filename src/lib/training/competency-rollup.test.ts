import { describe, expect, it } from "vitest";
import { competencyDashboard, competencyRollups } from "./competency-rollup";

const base = { employeeId: "e1", programId: "p1", assessedAt: "2026-09-01T12:00:00.000Z" };

describe("competency rollups", () => {
  it("uses only the latest assessment per employee and program", () => {
    const rollups = competencyRollups([
      { id: "old", ...base, assessedAt: "2026-08-01T12:00:00.000Z", outcome: "NOT_QUALIFIED", expiresAt: null },
      { id: "new", ...base, outcome: "QUALIFIED", expiresAt: "2027-01-01" },
    ], "2026-09-07");
    expect(rollups).toHaveLength(1);
    expect(rollups[0]?.id).toBe("new");
    expect(rollups[0]?.status).toBe("CURRENT");
  });

  it("derives due-soon and expired status without mutating assessment history", () => {
    expect(competencyRollups([{ id: "due", ...base, outcome: "QUALIFIED", expiresAt: "2026-09-30" }], "2026-09-07")[0]?.status).toBe("DUE_SOON");
    expect(competencyRollups([{ id: "expired", ...base, outcome: "QUALIFIED", expiresAt: "2026-09-01" }], "2026-09-07")[0]?.status).toBe("EXPIRED");
  });

  it("summarizes operational status counts", () => {
    const rollups = competencyRollups([
      { id: "a", ...base, employeeId: "e1", outcome: "QUALIFIED", expiresAt: "2027-01-01" },
      { id: "b", ...base, employeeId: "e2", outcome: "NOT_QUALIFIED", expiresAt: null },
      { id: "c", ...base, employeeId: "e3", outcome: "CONDITIONAL", expiresAt: null },
    ], "2026-09-07");
    expect(competencyDashboard(rollups)).toEqual({ total: 3, current: 1, dueSoon: 0, expired: 0, notQualified: 1, conditional: 1 });
  });
  it("keeps reassessment history independent across employees and programs", () => {
    const records = [
      { id: "old-e1-p1", ...base, assessedAt: "2026-08-01T12:00:00.000Z", outcome: "NOT_QUALIFIED" as const, expiresAt: null },
      { id: "new-e1-p1", ...base, outcome: "QUALIFIED" as const, expiresAt: "2027-01-01" },
      { id: "e1-p2", ...base, programId: "p2", outcome: "CONDITIONAL" as const, expiresAt: null },
      { id: "e2-p1", ...base, employeeId: "e2", outcome: "NOT_QUALIFIED" as const, expiresAt: null },
    ];
    const snapshot = JSON.stringify(records);
    const rollups = competencyRollups(records, "2026-09-07");
    expect(rollups).toHaveLength(3);
    expect(rollups.find((item) => item.employeeId === "e1" && item.programId === "p1")?.id).toBe("new-e1-p1");
    expect(rollups.find((item) => item.employeeId === "e1" && item.programId === "p2")?.status).toBe("CONDITIONAL");
    expect(rollups.find((item) => item.employeeId === "e2" && item.programId === "p1")?.status).toBe("NOT_QUALIFIED");
    expect(JSON.stringify(records)).toBe(snapshot);
  });

  it("treats expiration day as valid and transitions from due soon to expired the following day", () => {
    const records = [{ id: "boundary", ...base, outcome: "QUALIFIED" as const, expiresAt: "2026-10-01" }];
    expect(competencyRollups(records, "2026-09-01")[0]?.status).toBe("DUE_SOON");
    expect(competencyRollups(records, "2026-10-01")[0]?.status).toBe("DUE_SOON");
    expect(competencyRollups(records, "2026-10-02")[0]?.status).toBe("EXPIRED");
  });

  it("does not turn conditional or not-qualified decisions into qualified status based on expiration", () => {
    const records = [
      { id: "conditional", ...base, employeeId: "e1", outcome: "CONDITIONAL" as const, expiresAt: "2026-01-01" },
      { id: "failed", ...base, employeeId: "e2", outcome: "NOT_QUALIFIED" as const, expiresAt: "2027-01-01" },
    ];
    const rollups = competencyRollups(records, "2026-09-07");
    expect(rollups.map((item) => item.status)).toEqual(["CONDITIONAL", "NOT_QUALIFIED"]);
    expect(competencyDashboard(rollups).current).toBe(0);
  });

});
