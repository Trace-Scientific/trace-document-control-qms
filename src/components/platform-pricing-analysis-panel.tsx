"use client";

import { useEffect, useState } from "react";
import styles from "./platform-administration-shell.module.css";

type Cost={
  id:string;planVersionId:string;infrastructureMonthlyCents:number;supportMonthlyCents:number;
  operationsMonthlyCents:number;paymentFeeBasisPoints:number;paymentFixedFeeCents:number;
  onboardingCostCents:number;notes:string|null;assumptionDate:string;lockVersion:number;
};
type Analysis={
  planVersionId:string;planCode:string;planName:string;version:number;status:string;
  billingCadence:"MONTHLY"|"ANNUAL"|"CUSTOM"|null;currency:string|null;baseAmountCents:number|null;
  cost:Cost|null;normalizedMonthlyRevenueCents:number|null;estimatedMonthlyCostCents:number|null;
  estimatedMonthlyGrossMarginCents:number|null;estimatedGrossMarginPercent:number|null;
};
type Competitor={
  id:string;competitorName:string;offeringName:string|null;billingCadence:string|null;currency:string|null;
  amountCents:number|null;includedUsers:number|null;sourceLabel:string;sourceUrl:string|null;
  observedOn:string;notes:string|null;createdAt:string;
};

function money(currency:string|null,cents:number|null){
  if(!currency||cents===null) return "Not available";
  try{return new Intl.NumberFormat(undefined,{style:"currency",currency}).format(cents/100);}
  catch{return currency+" "+(cents/100).toFixed(2);}
}

export function PlatformPricingAnalysisPanel({canManage}:{canManage:boolean}){
  const [analysis,setAnalysis]=useState<Analysis[]>([]);
  const [competitors,setCompetitors]=useState<Competitor[]>([]);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);

  async function load(){
    const r=await fetch("/api/platform/pricing-analysis/workspace",{cache:"no-store"});
    const p=await r.json().catch(()=>null);
    if(!r.ok) throw new Error(p?.error||"Commercial pricing analysis could not be loaded.");
    setAnalysis(p.data.analysis);setCompetitors(p.data.competitors);
  }

  useEffect(()=>{void Promise.resolve().then(()=>load()).catch(e=>setError(e instanceof Error?e.message:"Commercial pricing analysis could not be loaded."));},[]);

  async function setCosts(item:Analysis){
    const current=item.cost;
    const ask=(label:string,value:number)=>window.prompt(label,String(value));
    const infra=ask("Monthly infrastructure cost in cents",current?.infrastructureMonthlyCents??0); if(infra===null)return;
    const support=ask("Monthly support cost in cents",current?.supportMonthlyCents??0); if(support===null)return;
    const ops=ask("Monthly operations cost in cents",current?.operationsMonthlyCents??0); if(ops===null)return;
    const bps=ask("Payment fee in basis points (100 = 1%)",current?.paymentFeeBasisPoints??0); if(bps===null)return;
    const fixed=ask("Payment fixed fee in cents",current?.paymentFixedFeeCents??0); if(fixed===null)return;
    const onboarding=ask("One-time onboarding cost in cents",current?.onboardingCostCents??0); if(onboarding===null)return;
    const date=window.prompt("Assumption date (YYYY-MM-DD)",current?.assumptionDate?.slice(0,10)??new Date().toISOString().slice(0,10)); if(!date)return;
    const notes=window.prompt("Assumption notes (optional)",current?.notes??"");
    const values=[infra,support,ops,bps,fixed,onboarding].map(Number);
    if(values.some(v=>!Number.isInteger(v)||v<0)||values[3]>10000){setError("Costs must be non-negative integers and payment basis points must be 0-10000.");return;}
    const reason=window.prompt("Reason for saving pricing cost assumptions"); if(!reason?.trim())return;
    await post("/api/platform/pricing-analysis/costs",{
      planVersionId:item.planVersionId,infrastructureMonthlyCents:values[0],supportMonthlyCents:values[1],
      operationsMonthlyCents:values[2],paymentFeeBasisPoints:values[3],paymentFixedFeeCents:values[4],
      onboardingCostCents:values[5],assumptionDate:date,notes:notes?.trim()||null,
      expectedLockVersion:current?.lockVersion??null,reason
    },"Cost assumptions saved with platform audit evidence.");
  }

  async function addCompetitor(){
    const competitorName=window.prompt("Competitor name"); if(!competitorName?.trim())return;
    const offeringName=window.prompt("Offering / plan name (optional)","");
    const cadence=(window.prompt("Billing cadence: MONTHLY, ANNUAL, CUSTOM, or blank","MONTHLY")||"").toUpperCase();
    if(cadence&&!["MONTHLY","ANNUAL","CUSTOM"].includes(cadence)){setError("Billing cadence is invalid.");return;}
    const currency=(window.prompt("Currency (optional)","USD")||"").toUpperCase();
    if(currency&&!/^[A-Z]{3}$/.test(currency)){setError("Currency must be a 3-letter code.");return;}
    const amountRaw=window.prompt("Observed price in cents (optional)",""); if(amountRaw===null)return;
    const usersRaw=window.prompt("Included users (optional)",""); if(usersRaw===null)return;
    const amount=amountRaw.trim()===""?null:Number(amountRaw),includedUsers=usersRaw.trim()===""?null:Number(usersRaw);
    if((amount!==null&&(!Number.isInteger(amount)||amount<0))||(includedUsers!==null&&(!Number.isInteger(includedUsers)||includedUsers<0))){setError("Observed amount/users must be non-negative integers.");return;}
    const sourceLabel=window.prompt("Source label (required, e.g. vendor pricing page)"); if(!sourceLabel?.trim())return;
    const sourceUrl=window.prompt("Source URL (optional)","");
    const observedOn=window.prompt("Date observed (YYYY-MM-DD)",new Date().toISOString().slice(0,10)); if(!observedOn)return;
    const notes=window.prompt("Observation notes (optional)","");
    const reason=window.prompt("Reason for recording this competitive pricing observation"); if(!reason?.trim())return;
    await post("/api/platform/pricing-analysis/competitors",{competitorName,offeringName:offeringName?.trim()||null,billingCadence:cadence||null,currency:currency||null,amountCents:amount,includedUsers,sourceLabel,sourceUrl:sourceUrl?.trim()||null,observedOn,notes:notes?.trim()||null,reason},"Competitive pricing observation recorded.");
  }

  async function post(url:string,body:Record<string,unknown>,success:string){
    setBusy(true);setError(null);setNotice(null);
    try{
      const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
      const p=await r.json().catch(()=>null);if(!r.ok)throw new Error(p?.error||"Pricing analysis action failed.");
      setNotice(success);await load();
    }catch(e){setError(e instanceof Error?e.message:"Pricing analysis action failed.");}
    finally{setBusy(false);}
  }

  return <article className={styles.card}>
    <h3>Commercial pricing analysis</h3>
    <p>Internal planning only. Public pricing remains configurable and business-approved; this workspace does not publish prices.</p>
    {analysis.length===0?<p>No plan versions are available.</p>:analysis.map(item=><div key={item.planVersionId}>
      <strong>{item.planName} · v{item.version} · {item.status}</strong>
      <p>Catalog: {item.billingCadence??"No cadence"} · {money(item.currency,item.baseAmountCents)}</p>
      <p>Normalized monthly revenue: {money(item.currency,item.normalizedMonthlyRevenueCents)} · estimated monthly cost: {money(item.currency,item.estimatedMonthlyCostCents)}</p>
      <p>Estimated monthly gross margin: {money(item.currency,item.estimatedMonthlyGrossMarginCents)}{item.estimatedGrossMarginPercent===null?"":" · "+item.estimatedGrossMarginPercent.toFixed(2)+"%"}</p>
      <p>Assumptions: {item.cost?new Date(item.cost.assumptionDate).toLocaleDateString()+" · onboarding cost "+money(item.currency,item.cost.onboardingCostCents):"Not entered"}</p>
      {canManage?<button type="button" disabled={busy} onClick={()=>void setCosts(item)}>{item.cost?"Update cost assumptions":"Add cost assumptions"}</button>:null}
    </div>)}

    <h4>Competitive pricing observations</h4>
    <p>Observations are dated and source-attributed because competitor pricing changes.</p>
    {canManage?<button type="button" disabled={busy} onClick={()=>void addCompetitor()}>Record competitor observation</button>:null}
    {competitors.length===0?<p>No competitor observations recorded.</p>:competitors.map(item=><div key={item.id}>
      <strong>{item.competitorName}{item.offeringName?" · "+item.offeringName:""}</strong>
      <p>{item.billingCadence??"Cadence not recorded"} · {money(item.currency,item.amountCents)}{item.includedUsers===null?"":" · "+item.includedUsers+" users"}</p>
      <p>Observed {new Date(item.observedOn).toLocaleDateString()} · Source: {item.sourceLabel}</p>
      {item.sourceUrl?<p><a href={item.sourceUrl} target="_blank" rel="noreferrer">Open recorded source</a></p>:null}
    </div>)}
    {error?<div className={styles.error} role="alert">{error}</div>:null}
    {notice?<div className={styles.notice} role="status">{notice}</div>:null}
  </article>;
}
