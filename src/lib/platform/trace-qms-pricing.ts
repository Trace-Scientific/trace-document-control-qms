/** Trace QMS approved commercial price schedule v1.0 (2026-10-14).
 * Quotation-only calculations. Do not use this module to grant entitlements,
 * change existing contracts, activate plans, or charge customers.
 * Currency amounts are integer USD cents to avoid floating point rounding.
 */
export const TRACE_QMS_PRICE_VERSION = "2026-10-14-v1.0" as const;
export const TRACE_QMS_MODULES = {
  document_control: 14900,
  personnel: 4900,
  training: 6900,
  competency: 7900,
  quality_events: 6900,
  laboratory_operations: 7900,
  records: 3900,
  reporting_analytics: 3900,
} as const;
export type TraceQmsModule = keyof typeof TRACE_QMS_MODULES;
export type OptionalTraceQmsModule = Exclude<TraceQmsModule, "document_control">;
export const TRACE_QMS_USER_TIERS = [
  { max: 10, cents: 900 },
  { max: 25, cents: 800 },
  { max: 50, cents: 700 },
  { max: 100, cents: 600 },
  { max: 250, cents: 500 },
  { max: 500, cents: 400 },
] as const;
export const TRACE_QMS_PACKAGES = {
  essential: { users: 10, modules: [] as OptionalTraceQmsModule[], setupCents: 29900 },
  professional: { users: 25, modules: ["personnel", "training", "competency", "quality_events"] as OptionalTraceQmsModule[], setupCents: 49900 },
  enterprise: { users: 50, modules: ["personnel", "training", "competency", "quality_events", "laboratory_operations", "records", "reporting_analytics"] as OptionalTraceQmsModule[], setupCents: 99900 },
} as const;
export type TraceQmsPackage = keyof typeof TRACE_QMS_PACKAGES;
export interface TraceQmsQuoteInput {
  users: number;
  modules?: readonly OptionalTraceQmsModule[];
  additionalSites?: number;
  annualPrepay?: boolean;
  package?: TraceQmsPackage;
}
export interface TraceQmsQuote {
  priceVersion: typeof TRACE_QMS_PRICE_VERSION;
  users: number;
  modules: readonly OptionalTraceQmsModule[];
  userRateCents: number;
  coreCents: number;
  optionalModulesCents: number;
  usersCents: number;
  additionalSitesCents: number;
  monthlySubtotalCents: number;
  monthlyEquivalentCents: number;
  annualContractCents: number;
  setupCents: number | null;
  annualPrepay: boolean;
}
export function calculateTraceQmsQuote(input: TraceQmsQuoteInput): TraceQmsQuote {
  if (!Number.isSafeInteger(input.users) || input.users < 1 || input.users > 500) {
    throw new RangeError("User count must be a whole number from 1 to 500; 501+ requires a custom quote.");
  }
  const additionalSites = input.additionalSites ?? 0;
  if (!Number.isSafeInteger(additionalSites) || additionalSites < 0) {
    throw new RangeError("Additional sites must be a nonnegative whole number.");
  }
  const pkg = input.package ? TRACE_QMS_PACKAGES[input.package] : undefined;
  if (input.package && !pkg) throw new RangeError("Unknown subscription package.");
  if (pkg && (input.users !== pkg.users || input.modules !== undefined)) {
    throw new RangeError("Package users and modules are fixed; use a custom quote for variations.");
  }
  const modules = pkg ? [...pkg.modules] : [...(input.modules ?? [])];
  if (new Set(modules).size !== modules.length || modules.some(m => !(m in TRACE_QMS_MODULES) || m === "document_control")) {
    throw new RangeError("Modules must be unique, valid optional modules.");
  }
  const tier = TRACE_QMS_USER_TIERS.find(t => input.users <= t.max);
  if (!tier) throw new RangeError("Enterprise quote required.");
  const optionalModulesCents = modules.reduce<number>((sum, module) => sum + TRACE_QMS_MODULES[module], 0);
  const usersCents = input.users * tier.cents;
  const additionalSitesCents = additionalSites * 9900;
  const monthlySubtotalCents = TRACE_QMS_MODULES.document_control + optionalModulesCents + usersCents + additionalSitesCents;
  const annualPrepay = input.annualPrepay === true;
  const annualContractCents = annualPrepay ? monthlySubtotalCents * 12 * 9 / 10 : monthlySubtotalCents * 12;
  return {
    priceVersion: TRACE_QMS_PRICE_VERSION,
    users: input.users,
    modules,
    userRateCents: tier.cents,
    coreCents: TRACE_QMS_MODULES.document_control,
    optionalModulesCents,
    usersCents,
    additionalSitesCents,
    monthlySubtotalCents,
    monthlyEquivalentCents: annualContractCents / 12,
    annualContractCents,
    setupCents: pkg ? pkg.setupCents : null,
    annualPrepay,
  };
}
