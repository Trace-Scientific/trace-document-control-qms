"use client";

import { useMemo, useState } from "react";
import { calculateTraceQmsProposal } from "@/lib/platform/trace-qms-proposal";
import {
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
  const [customerName, setCustomerName] = useState("");
  const [foundingDiscountPercent, setFoundingDiscountPercent] = useState(0);
  const [preparedBy, setPreparedBy] = useState("");
  const [approvalConfirmed, setApprovalConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [savedProposals, setSavedProposals] = useState<Array<{id:string;customerName:string;status:string;priceVersion:string;revision:number}>>([]);
  const quote = useMemo(() => {
    try {
      return { value: calculateTraceQmsProposal({
        customerName: customerName || "Internal estimate", foundingDiscountPercent,
        users: packageCode === "essential" ? 10 : packageCode === "professional" ? 25 : packageCode === "enterprise" ? 50 : users,
        ...(packageCode === "custom" ? { modules } : { package: packageCode }),
        additionalSites, annualPrepay,
      }), error: null };
    } catch (error) {
      return { value: null, error: error instanceof Error ? error.message : "Invalid quote." };
    }
  }, [packageCode, users, modules, additionalSites, annualPrepay, customerName, foundingDiscountPercent]);
  async function saveDraft() {
    if (!quote.value || !customerName.trim()) return;
    setSaving(true); setSaveMessage("");
    try {
      const input = {
        customerName: customerName.trim(), foundingDiscountPercent,
        users: packageCode === "essential" ? 10 : packageCode === "professional" ? 25 : packageCode === "enterprise" ? 50 : users,
        ...(packageCode === "custom" ? { modules } : { package: packageCode }),
        additionalSites, annualPrepay,
      };
      const response = await fetch("/api/platform/commercial-proposals", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Unable to save draft proposal.");
      setSaveMessage("Draft quotation saved. Proposal ID: " + payload.data.id);
    } catch (error) { setSaveMessage(error instanceof Error ? error.message : "Unable to save draft proposal."); }
    finally { setSaving(false); }
  }
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{revision:number;action:string;fromStatus:string;toStatus:string;actorIdentityId:string;reason:string;occurredAt:string}>>([]);
  async function viewHistory(proposalId: string) {
    setSaveMessage(""); setHistoryId(null); setHistory([]);
    try {
      const response = await fetch("/api/platform/commercial-proposals/history?proposalId=" + encodeURIComponent(proposalId), { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Unable to retrieve history.");
      setHistory(payload.data); setHistoryId(proposalId);
    } catch (error) { setSaveMessage(error instanceof Error ? error.message : "Unable to retrieve history."); }
  }
  const [transitioning, setTransitioning] = useState<string | null>(null);
  async function transitionSaved(item: {id:string;revision:number}, action: "SUBMIT" | "APPROVE" | "REJECT") {
    const reason = window.prompt("Reason for " + action.toLowerCase() + " (required)");
    if (!reason?.trim()) return;
    setTransitioning(item.id); setSaveMessage("");
    try {
      const response = await fetch("/api/platform/commercial-proposals/transition", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId: item.id, expectedRevision: item.revision, action, reason: reason.trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Proposal transition failed.");
      setSaveMessage("Proposal " + action.toLowerCase() + " completed.");
      await loadSaved(true);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Proposal transition failed.");
    } finally { setTransitioning(null); }
  }
  async function loadSaved(preserveMessage = false) {
    if (!preserveMessage) setSaveMessage("");
    try {
      const response = await fetch("/api/platform/commercial-proposals", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Unable to load saved proposals.");
      setSavedProposals(payload.data);
    } catch (error) { setSaveMessage(error instanceof Error ? error.message : "Unable to load saved proposals."); }
  }
  return <article style={{border:"1px solid var(--border, #d1d5db)",borderRadius:12,padding:20}}>
    <h3>Trace QMS subscription quote preview</h3>
    <p>Internal estimate · Pricing {TRACE_QMS_PRICE_VERSION} · USD. Does not create a customer subscription or authorize access.</p>
    <label>Prepared by <input value={preparedBy} maxLength={120} onChange={e=>setPreparedBy(e.target.value)} placeholder="Trace Scientific representative"/></label>
    <label>Customer / laboratory name <input value={customerName} maxLength={200} onChange={e=>setCustomerName(e.target.value)} placeholder="Prospective laboratory"/></label>
    <label>Founding-customer discount (%) <input type="number" min={0} max={15} step={1} value={foundingDiscountPercent} onChange={e=>setFoundingDiscountPercent(Number(e.target.value))}/></label>
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
      <p>Core platform: {money(quote.value.quote.coreCents)}/mo · Optional modules: {money(quote.value.quote.optionalModulesCents)}/mo</p>
      <p>{quote.value.quote.users} users × {money(quote.value.quote.userRateCents)}: {money(quote.value.quote.usersCents)}/mo · Additional sites: {money(quote.value.quote.additionalSitesCents)}/mo</p>
      {quote.value.quote.packageDiscountCents>0?<p>Package discount: −{money(quote.value.quote.packageDiscountCents)}/mo</p>:null}
      <p><strong>Monthly subscription subtotal: {money(quote.value.quote.monthlySubtotalCents)}</strong></p>
      {annualPrepay?<p>Annual prepayment equivalent: {money(quote.value.quote.monthlyEquivalentCents)}/mo after 10% discount</p>:null}
      {quote.value.foundingDiscountCents>0?<p>Founding-customer discount (approval required): −{money(quote.value.foundingDiscountCents)}/mo</p>:null}
      <p><strong>Customer recurring monthly rate: {money(quote.value.discountedMonthlyCents)}</strong></p>
      <p><strong>12-month recurring subscription: {money(quote.value.annualRecurringCents)}</strong></p>
      {quote.value.quote.setupCents!==null?<p>One-time onboarding (not included above): {money(quote.value.quote.setupCents)}</p>:<p>Onboarding, migration, and custom integrations: separately quoted.</p>}
      {quote.value.estimatedFirstYearCents!==null?<p>Estimated first year including onboarding: {money(quote.value.estimatedFirstYearCents)}</p>:null}
      {quote.value.requiresCommercialApproval?<label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" checked={approvalConfirmed} onChange={e=>setApprovalConfirmed(e.target.checked)}/> I confirm the founding-customer discount has received commercial approval.</label>:null}
      <button type="button" disabled={saving || !customerName.trim()} onClick={()=>void saveDraft()}>{saving ? "Saving…" : "Save draft quotation"}</button>
      <button type="button" onClick={()=>void loadSaved()}>View saved quotations</button>
      {saveMessage?<p role="status">{saveMessage}</p>:null}
      {savedProposals.length>0?<ul>{savedProposals.map(item=><li key={item.id}>
        <strong>{item.customerName}</strong> · {item.status} · revision {item.revision} · {item.priceVersion}
        <button type="button" onClick={()=>void viewHistory(item.id)}>View approval history</button>
        {historyId===item.id?<div><p>Recorded approval events:</p>{history.length===0?<p>No transitions recorded.</p>:<ol>{history.map(event=><li key={event.revision}>
          Revision {event.revision}: {event.fromStatus} → {event.toStatus} ({event.action}) · {new Date(event.occurredAt).toLocaleString()} · Actor ID: {event.actorIdentityId} · Reason: {event.reason}
        </li>)}</ol>}</div>:null}
        {item.status==="DRAFT"?<button type="button" disabled={transitioning!==null} onClick={()=>void transitionSaved(item,"SUBMIT")}>Submit for approval</button>:null}
        {item.status==="SUBMITTED"?<>
          <button type="button" disabled={transitioning!==null} onClick={()=>void transitionSaved(item,"APPROVE")}>Approve</button>
          <button type="button" disabled={transitioning!==null} onClick={()=>void transitionSaved(item,"REJECT")}>Reject</button>
        </>:null}
      </li>)}</ul>:null}
      <button type="button" disabled={!customerName.trim() || !preparedBy.trim() || (quote.value.requiresCommercialApproval && !approvalConfirmed)} onClick={()=>window.print()}>Print / save customer quotation as PDF</button>
      <p>Prepared for: {quote.value.customerName} · Prepared by: {preparedBy || "Not specified"} · Pricing version: {TRACE_QMS_PRICE_VERSION}</p>
      <p>Quotation preview only; subject to final commercial approval and execution of a separate agreement. No subscription is activated by this document.</p>
      <p>Estimate excludes applicable taxes and custom services. Feature availability must be confirmed before contracting. Existing customer pricing is unaffected.</p>
    </div>:null}
  </article>;
}
