import { describe, expect, it } from "vitest";

function renderDateOnly(value: string | null) {
  if (!value) return "—";
  const calendar = value.slice(0, 10);
  const [year, month, day] = calendar.split("-").map(Number);
  if (!year || !month || !day) return calendar;
  return `${month}/${day}/${year}`;
}

describe("competency expiration rendering", () => {
  it("preserves the governed calendar date instead of converting through local timezone", () => {
    expect(renderDateOnly("2027-09-14T00:00:00.000Z")).toBe("9/14/2027");
  });
});
