import { describe, expect, it } from "vitest";
import { calculateTraceQmsQuote, TRACE_QMS_PACKAGES } from "./trace-qms-pricing";

describe("approved Trace QMS v1 quotation math", () => {
  it("prices approved packages", () => {
    expect(calculateTraceQmsQuote({ package: "essential", users: 10 }).monthlySubtotalCents).toBe(23900);
    expect(calculateTraceQmsQuote({ package: "professional", users: 25 }).monthlySubtotalCents).toBe(61500);
    expect(calculateTraceQmsQuote({ package: "enterprise", users: 50 }).monthlySubtotalCents).toBe(87200);
    expect(TRACE_QMS_PACKAGES.professional.setupCents).toBe(49900);
  });
  it.each([[10,900],[11,800],[25,800],[26,700],[50,700],[51,600],[100,600],[101,500],[250,500],[251,400],[500,400]])("uses correct whole-volume rate for %i users", (users, rate) => {
    expect(calculateTraceQmsQuote({ users }).userRateCents).toBe(rate);
  });
  it("computes annual prepay discount and extra site", () => {
    const quote=calculateTraceQmsQuote({users:10,additionalSites:1,annualPrepay:true});
    expect(quote.monthlySubtotalCents).toBe(33800);
    expect(quote.annualContractCents).toBe(365040);
    expect(quote.monthlyEquivalentCents).toBe(30420);
  });
  it("rejects custom-quote range, duplicates and invalid counts", () => {
    expect(() => calculateTraceQmsQuote({users:501})).toThrow();
    expect(() => calculateTraceQmsQuote({users:0})).toThrow();
    expect(() => calculateTraceQmsQuote({users:10.5})).toThrow();
    expect(() => calculateTraceQmsQuote({users:10,modules:["training","training"]})).toThrow();
    expect(() => calculateTraceQmsQuote({users:10,additionalSites:-1})).toThrow();
  });
});
