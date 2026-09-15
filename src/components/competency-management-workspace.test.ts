import { describe, expect, it } from "vitest";

function formatDateOnly(value: string | null) {
  if (!value) return "—";
  const calendar = value.slice(0, 10);
  const [year, month, day] = calendar.split("-").map(Number);
  if (!year || !month || !day) return calendar;
  return `${month}/${day}/${year}`;
}

describe("competency date-only rendering", () => {
  it("does not timezone-shift an expiration date", () => {
    expect(formatDateOnly("2027-09-14T00:00:00.000Z")).toBe("9/14/2027");
  });
});
