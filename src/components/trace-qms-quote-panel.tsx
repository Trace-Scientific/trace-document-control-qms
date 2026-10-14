"use client";

import { useMemo, useState } from "react";
import {
  calculateTraceQmsQuote,
  TRACE_QMS_MODULES,
  TRACE_QMS_PRICE_VERSION,
  type OptionalTraceQmsModule,
  type TraceQmsPackage,
} from "@/lib/platform/trace-qms-pricing";

const optionalModules = Object.keys(TRACE_QMS_MODULES).filter(
  (key): key is OptionalTraceQmsModule => key !== "document_control",
);
const names: Record<OptionalTraceQmsModule, string> = {
  personnel: "Personnel management",
  training: "Training management",
  competency: "Competency assessment",
  quality_events: "Quality events & CAPA",
  laboratory_operations: "Laboratory operations",
  records: "Records management",
  reporting_analytics: "Reporting & analytics",
};
const money = (cents: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD",
}).format(cents / 100);

/** Read-only quote preview: never creates subscriptions or modifies entitlements. */
export function TraceQmsQuotePanel() {
  const [packageCode, setPackageCode] = useState<"custom" | TraceQmsPackage>("essential");
  const [users, setUsers] = useState(10);
  const [modules, setModules] = useState<OptionalTraceQmsModule[]>([]);
  const [additionalSites, setAdditionalSites] = useState(0);
  const [annualPrepay, setAnnualPrepay] = useState(false);
  const quote = useMemo(() => {
    try {
      return { value: calculateTraceQmsQuote({
        users: packageCode === "essential" ? 10 : packageCode === "professional" ? 25 : packageCode === "enterprise" ? 50 : users,
        ...(packageCode === "custom" ? { modules } : { package: packageCode }),
        additionalSites, annualPrepay,
      }), error: null };
    } catch (error) {
      return { value: null, error: error instanceof Error ? error.message : "Invalid quote." };
    }
  }, [packageCode, users, modules, additionalSites, annualPrepay]);
  return <article style={{border:"1px solid var(--border, #d1d5db)",borderRadius:12,padding:20}}>
    <h3>Trace QMS subscription quote preview</h3>
    <p>Internal estimate · Pricing {TRACE_QMS_PRICE_VERSION} · USD. Does not create a customer subscription or authorize access.</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12}}>
      <label>Package
        <select aria-label="Package" value={packageCode} onChange={e=>setPackageCode(e.target.value as typeof packageCode)}>
          <option value="essential">Essential · 10 users</option>
          <option value="professional">Professional · 25 users</option>
          <option value="enterprise">Enterprise · 50 users</option>
          <option value="custom">Custom module selection</option>
        </select>
      </label>
      {packageCode==="custom"?<label>Named active users
        <input type="number" min={1} max={500} step={1} value={users} onChange={e=>setUsers(Number(e.target.value))}/>
      </label>:null}
      <label>Additional laboratory sites
        <input type="number" min={0} step={1} value={additionalSites} onChange={e=>setAdditionalSites(Number(e.target.value))}/>
      </label>
      <label style={{display:"flex",gap:8,alignItems:"center"}}>
        <input type="checkbox" checked={annualPrepay} onChange={e=>setAnnualPrepay(e.target.checked)}/>
        Annual prepayment (10% off recurring fees)
      </label>
    </div>
    {packageCode==="custom"?<fieldset style={{marginTop:12}}>
      <legend>Optional modules (core Document Control is always included)</legend>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:8}}>
        {optionalModules.map(module=><label key={module} style={{display:"flex",gap:8,alignItems:"center"}}>
          <input type="checkbox" checked={modules.includes(module)} onChange={e=>setModules(current=>e.target.checked?[...current,module]:current.filter(x=>x!==module))}/>
          {names[module]} · {money(TRACE_QMS_MODULES[module])}/mo
        </label>)}
      </div>
    </fieldset>:null}
    {quote.error?<p role="alert">{quote.error}</p>:null}
    {quote.value? <div aria-live="polite" style={{marginTop:16}}>
      <p>Core platform: {money(quote.value.coreCents)}/mo · Optional modules: {money(quote.value.optionalModulesCents)}/mo</p>
      <p>{quote.value.users} users × {money(quote.value.userRateCents)}: {money(quote.value.usersCents)}/mo · Additional sites: {money(quote.value.additionalSitesCents)}/mo</p>
      {quote.value.packageDiscountCents>0?<p>Package discount: −{money(quote.value.packageDiscountCents)}/mo</p>:null}
      <p><strong>Monthly subscription subtotal: {money(quote.value.monthlySubtotalCents)}</strong></p>
      {annualPrepay?<p>Annual prepayment equivalent: {money(quote.value.monthlyEquivalentCents)}/mo after 10% discount</p>:null}
      <p><strong>12-month recurring subscription: {money(quote.value.annualContractCents)}</strong></p>
      {quote.value.setupCents!==null?<p>One-time onboarding (not included above): {money(quote.value.setupCents)}</p>:<p>Onboarding, migration, and custom integrations: separately quoted.</p>}
      <p>Estimate excludes applicable taxes and custom services. Feature availability must be confirmed before contracting. Existing customer pricing is unaffected.</p>
    </div>:null}
  </article>;
}
