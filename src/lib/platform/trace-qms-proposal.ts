import { calculateTraceQmsQuote, type TraceQmsQuoteInput } from "./trace-qms-pricing";

/** Internal proposal preview only. No subscription, payment, or entitlement side effects. */
export interface TraceQmsProposalInput extends TraceQmsQuoteInput {
  customerName: string;
  foundingDiscountPercent?: number;
}

export function calculateTraceQmsProposal(input: TraceQmsProposalInput) {
  const customerName = input.customerName.trim();
  if (!customerName || customerName.length > 200) {
    throw new RangeError("Customer name must contain 1–200 characters.");
  }
  const foundingDiscountPercent = input.foundingDiscountPercent ?? 0;
  if (!Number.isSafeInteger(foundingDiscountPercent) || foundingDiscountPercent < 0 || foundingDiscountPercent > 15) {
    throw new RangeError("Founding-customer discount must be a whole percentage from 0 to 15.");
  }
  if (input.annualPrepay && foundingDiscountPercent > 0) {
    throw new RangeError("Annual prepayment and founding-customer discounts cannot be combined.");
  }
  const quote = calculateTraceQmsQuote(input);
  const foundingDiscountCents = Math.round(quote.monthlySubtotalCents * foundingDiscountPercent / 100);
  const discountedMonthlyCents = quote.monthlySubtotalCents - foundingDiscountCents;
  const annualRecurringCents = input.annualPrepay ? quote.annualContractCents : discountedMonthlyCents * 12;
  return {
    customerName,
    quote,
    foundingDiscountPercent,
    foundingDiscountCents,
    discountedMonthlyCents,
    annualRecurringCents,
    estimatedFirstYearCents: quote.setupCents === null ? null : annualRecurringCents + quote.setupCents,
    requiresCommercialApproval: foundingDiscountPercent > 0,
  };
}
