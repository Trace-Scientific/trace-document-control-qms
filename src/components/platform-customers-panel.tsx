"use client";

import { useState } from "react";
import styles from "./platform-administration-shell.module.css";

export type CommercialCustomerAccount = {
  id:string;
  accountCode:string;
  displayName:string;
  legalName:string;
  status:string;
  organizationId:string|null;
  leadSource:string|null;
  contractAt:string|null;
  renewalAt:string|null;
  onboardingAmountCents:number|null;
  discountBasisPoints:number|null;
  lockVersion:number;
};

function money(cents:number|null){
  return cents===null ? "Not set" : new Intl.NumberFormat(undefined,{style:"currency",currency:"USD"}).format(cents/100);
}

function discount(basisPoints:number|null){
  return basisPoints===null ? "Not set" : (basisPoints/100).toFixed(2)+"%";
}

export function PlatformCustomersPanel({
  customers,
  canManage,
  onReload,
}:{customers:CommercialCustomerAccount[];canManage:boolean;onReload:()=>Promise<void>}){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);

  async function editProfile(customer:CommercialCustomerAccount){
    const leadSource=window.prompt("Lead/source",customer.leadSource??"");
    if(leadSource===null) return;

    const contractInput=window.prompt("Contract date/time (ISO, optional)",customer.contractAt??"");
    if(contractInput===null) return;
    let contractAt:string|null=null;
    if(contractInput.trim()){
      const parsed=new Date(contractInput);
      if(Number.isNaN(parsed.getTime())){setError("Contract date/time is invalid.");return;}
      contractAt=parsed.toISOString();
    }

    const renewalInput=window.prompt("Renewal date/time (ISO, optional)",customer.renewalAt??"");
    if(renewalInput===null) return;
    let renewalAt:string|null=null;
    if(renewalInput.trim()){
      const parsed=new Date(renewalInput);
      if(Number.isNaN(parsed.getTime())){setError("Renewal date/time is invalid.");return;}
      renewalAt=parsed.toISOString();
    }

    const onboardingRaw=window.prompt("Onboarding charge in cents (optional)",customer.onboardingAmountCents===null?"":String(customer.onboardingAmountCents));
    if(onboardingRaw===null) return;
    const onboardingAmountCents=onboardingRaw.trim()===""?null:Number(onboardingRaw);
    if(onboardingAmountCents!==null&&(!Number.isInteger(onboardingAmountCents)||onboardingAmountCents<0)){setError("Onboarding charge must be a non-negative integer number of cents.");return;}

    const discountRaw=window.prompt("Discount in basis points (100 = 1%, optional)",customer.discountBasisPoints===null?"":String(customer.discountBasisPoints));
    if(discountRaw===null) return;
    const discountBasisPoints=discountRaw.trim()===""?null:Number(discountRaw);
    if(discountBasisPoints!==null&&(!Number.isInteger(discountBasisPoints)||discountBasisPoints<0||discountBasisPoints>10000)){setError("Discount must be between 0 and 10000 basis points.");return;}

    const reason=window.prompt("Reason for updating customer commercial profile");
    if(!reason?.trim()) return;

    setBusy(true);setError(null);setNotice(null);
    try{
      const r=await fetch("/api/platform/customers/"+encodeURIComponent(customer.id),{
        method:"PATCH",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({
          leadSource:leadSource.trim()||null,
          contractAt,
          renewalAt,
          onboardingAmountCents,
          discountBasisPoints,
          expectedLockVersion:customer.lockVersion,
          reason
        })
      });
      const p=await r.json().catch(()=>null);
      if(!r.ok) throw new Error(p?.error||"Customer commercial profile could not be updated.");
      setNotice("Customer commercial profile updated with platform audit evidence.");
      await onReload();
    }catch(e){
      setError(e instanceof Error?e.message:"Customer commercial profile could not be updated.");
    }finally{
      setBusy(false);
    }
  }

  if(customers.length===0) return <div className={styles.notice}>No customer accounts are configured.</div>;

  return <div className={styles.grid}>
    {customers.map(customer=><article className={styles.card} key={customer.id}>
      <h3>{customer.displayName}</h3>
      <p>{customer.accountCode} · {customer.status}</p>
      <p>{customer.organizationId?"Tenant organization linked":"Prospect / no tenant linked"}</p>
      <p>Lead/source: {customer.leadSource||"Not set"}</p>
      <p>Contract: {customer.contractAt?new Date(customer.contractAt).toLocaleDateString():"Not set"} · Renewal: {customer.renewalAt?new Date(customer.renewalAt).toLocaleDateString():"Not set"}</p>
      <p>Onboarding charge: {money(customer.onboardingAmountCents)} · Discount: {discount(customer.discountBasisPoints)}</p>
      <p>Plan, billing cadence, subscription amount, enabled modules, and subscription status remain governed in Subscriptions & entitlements rather than duplicated here.</p>
      {canManage&&customer.status!=="TERMINATED"?<button type="button" disabled={busy} onClick={()=>void editProfile(customer)}>Edit commercial profile</button>:null}
    </article>)}
    {error?<div className={styles.error} role="alert">{error}</div>:null}
    {notice?<div className={styles.notice} role="status">{notice}</div>:null}
  </div>;
}
