"use client";

import { useEffect, useState } from "react";
import styles from "./platform-administration-shell.module.css";

type Customer={id:string;accountCode:string;displayName:string;legalName:string;status:string;organizationId:string|null};
type Plan={planVersionId:string;planId:string;planCode:string;planName:string;version:number;billingCadence:"MONTHLY"|"ANNUAL"|"CUSTOM"|null;currency:string|null;baseAmountCents:number|null;includedFullUsers:number|null;additionalUserRateCents:number|null;storageAllowanceGb:number|null};
type Subscription={id:string;customerAccountId:string;planVersionId:string;status:"PENDING"|"ACTIVE"|"SUSPENDED"|"CANCELLED"|"EXPIRED";startsAt:string;endsAt:string|null;lockVersion:number;customerCode:string;customerName:string;planCode:string;planName:string;planVersion:number};
type Override={id:string;customerAccountId:string;customerCode:string;customerName:string;featureKey:string;featureName:string;decision:"ENABLE"|"DISABLE";effectiveFrom:string;effectiveTo:string|null;reason:string;createdAt:string};

function money(currency:string|null,cents:number|null){
  if(!currency||cents===null) return "Not set";
  try{return new Intl.NumberFormat(undefined,{style:"currency",currency}).format(cents/100);}catch{return currency+" "+(cents/100).toFixed(2);}
}

function nextStatuses(status:Subscription["status"]):Subscription["status"][]{
  if(status==="PENDING") return ["ACTIVE","CANCELLED"];
  if(status==="ACTIVE") return ["SUSPENDED","CANCELLED","EXPIRED"];
  if(status==="SUSPENDED") return ["ACTIVE","CANCELLED","EXPIRED"];
  return [];
}

export function PlatformSubscriptionsPanel({customers,canManage}:{customers:Customer[];canManage:boolean}){
  const [plans,setPlans]=useState<Plan[]>([]);
  const [subscriptions,setSubscriptions]=useState<Subscription[]>([]);
  const [overrides,setOverrides]=useState<Override[]>([]);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);

  async function load(){
    const r=await fetch("/api/platform/subscriptions/workspace",{cache:"no-store"});
    const p=await r.json().catch(()=>null);
    if(!r.ok) throw new Error(p?.error||"Subscriptions workspace could not be loaded.");
    setPlans(p.data.plans); setSubscriptions(p.data.subscriptions); setOverrides(p.data.overrides);
  }

  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:"Subscriptions workspace could not be loaded."));},[]);

  async function createSubscription(){
    const eligible=customers.filter(c=>c.status==="ACTIVE"&&c.organizationId);
    if(!eligible.length){setError("No active tenant-linked customer is available.");return;}
    if(!plans.length){setError("No active plan version is available.");return;}
    const customerId=window.prompt("Customer account ID",eligible[0].id);
    if(!customerId) return;
    const planVersionId=window.prompt("Active plan version ID",plans[0].planVersionId);
    if(!planVersionId) return;
    const reason=window.prompt("Reason for assigning this subscription");
    if(!reason?.trim()) return;
    setBusy(true);setError(null);setNotice(null);
    try{
      const r=await fetch("/api/platform/subscriptions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({customerAccountId:customerId,planVersionId,startsAt:new Date().toISOString(),reason})});
      const p=await r.json().catch(()=>null);
      if(!r.ok) throw new Error(p?.error||"Subscription could not be created.");
      setNotice("Subscription created in PENDING state. Activate it only after commercial review.");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Subscription could not be created.");}
    finally{setBusy(false);}
  }

  async function transition(subscription:Subscription,toStatus:Subscription["status"]){
    const reason=window.prompt("Reason for changing "+subscription.customerName+" from "+subscription.status+" to "+toStatus);
    if(!reason?.trim()) return;
    setBusy(true);setError(null);setNotice(null);
    try{
      const r=await fetch("/api/platform/subscriptions/"+encodeURIComponent(subscription.id),{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({toStatus,expectedLockVersion:subscription.lockVersion,reason})});
      const p=await r.json().catch(()=>null);
      if(!r.ok) throw new Error(p?.error||"Subscription status could not be changed.");
      setNotice("Subscription changed to "+toStatus+". Historical subscription-change evidence was preserved.");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Subscription status could not be changed.");}
    finally{setBusy(false);}
  }

  return <div className={styles.grid}>
    <article className={styles.card}>
      <h3>Active plan versions</h3>
      <p>Pricing and allowances come from immutable activated plan versions. Existing subscriptions remain pinned to their contracted version.</p>
      {plans.length===0?<p>No active plan version is available.</p>:plans.map(plan=><div key={plan.planVersionId}>
        <strong>{plan.planName} · v{plan.version}</strong>
        <p>{plan.billingCadence??"Cadence not set"} · {money(plan.currency,plan.baseAmountCents)} · {plan.includedFullUsers??0} included full users</p>
      </div>)}
      {canManage?<button type="button" disabled={busy} onClick={()=>void createSubscription()}>{busy?"Working…":"Assign customer to active plan"}</button>:null}
    </article>

    <article className={styles.card}>
      <h3>Customer subscriptions</h3>
      <p>Commercial subscription state is separate from tenant QMS roles and does not rewrite governed historical records.</p>
      {subscriptions.length===0?<p>No subscriptions are configured.</p>:subscriptions.map(item=><div key={item.id}>
        <strong>{item.customerName} · {item.planName} v{item.planVersion}</strong>
        <p>{item.status} · starts {new Date(item.startsAt).toLocaleDateString()}</p>
        {canManage?nextStatuses(item.status).map(status=><button key={status} type="button" disabled={busy} onClick={()=>void transition(item,status)}>{status}</button>):null}
      </div>)}
    </article>

    <article className={styles.card}>
      <h3>Active entitlement overrides</h3>
      <p>Overrides are effective-dated commercial feature decisions. They do not create tenant permissions.</p>
      {overrides.length===0?<p>No active entitlement overrides.</p>:overrides.map(item=><div key={item.id}>
        <strong>{item.customerName} · {item.featureName}</strong>
        <p>{item.decision} · effective {new Date(item.effectiveFrom).toLocaleDateString()}</p>
      </div>)}
    </article>

    {error?<div className={styles.error} role="alert">{error}</div>:null}
    {notice?<div className={styles.notice} role="status">{notice}</div>:null}
  </div>;
}
