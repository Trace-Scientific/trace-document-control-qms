import { describe, expect, it } from "vitest";
import { calculateTraceQmsProposal } from "./trace-qms-proposal";

describe("Trace QMS proposal calculations", () => {
  it("includes Essential onboarding in first year", () => {
    const proposal = calculateTraceQmsProposal({ customerName: "Example Lab", users: 10, package: "essential" });
    expect(proposal.discountedMonthlyCents).toBe(23900);
    expect(proposal.estimatedFirstYearCents).toBe(316700);
  });
  it("preserves the Enterprise package discount", () => {
    const proposal = calculateTraceQmsProposal({ customerName: "Example Lab", users: 50, package: "enterprise", foundingDiscountPercent: 15 });
    expect(proposal.quote.packageDiscountCents).toBe(5000);
    expect(proposal.foundingDiscountCents).toBe(13080);
    expect(proposal.discountedMonthlyCents).toBe(74120);
    expect(proposal.requiresCommercialApproval).toBe(true);
  });
  it("prevents promotional discount stacking", () => {
    expect(() => calculateTraceQmsProposal({ customerName: "Lab", users: 10, annualPrepay: true, foundingDiscountPercent: 5 })).toThrow();
  });
  it("validates customer names and discounts", () => {
    expect(() => calculateTraceQmsProposal({ customerName: " ", users: 10 })).toThrow();
    expect(() => calculateTraceQmsProposal({ customerName: "Lab", users: 10, foundingDiscountPercent: 16 })).toThrow();
  });
});
