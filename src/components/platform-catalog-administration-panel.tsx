"use client";

import { useEffect, useState } from "react";
import styles from "./platform-administration-shell.module.css";

type Product={id:string;code:string;name:string;description:string|null;status:"DRAFT"|"ACTIVE"|"RETIRED"};
type Feature={id:string;productId:string;key:string;name:string;description:string|null;status:"DRAFT"|"ACTIVE"|"RETIRED"};
type Plan={id:string;productId:string;code:string;name:string;description:string|null;status:"DRAFT"|"ACTIVE"|"RETIRED"};
type Version={id:string;planId:string;version:number;status:"DRAFT"|"ACTIVE"|"RETIRED";effectiveFrom:string|null;effectiveTo:string|null;activatedAt:string|null;billingCadence:"MONTHLY"|"ANNUAL"|"CUSTOM"|null;currency:string|null;baseAmountCents:number|null;includedFullUsers:number|null;additionalUserRateCents:number|null;storageAllowanceGb:number|null;businessApprovedAt:string|null;businessApprovedByIdentityId:string|null;businessApprovedByMembershipId:string|null;businessApprovalReason:string|null};

export function PlatformCatalogAdministrationPanel({canManage}:{canManage:boolean}){
  const [products,setProducts]=useState<Product[]>([]);
  const [features,setFeatures]=useState<Feature[]>([]);
  const [plans,setPlans]=useState<Plan[]>([]);
  const [versions,setVersions]=useState<Version[]>([]);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);

  async function load(){
    const r=await fetch("/api/platform/catalog/workspace",{cache:"no-store"});
    const p=await r.json().catch(()=>null);
    if(!r.ok) throw new Error(p?.error||"Catalog workspace could not be loaded.");
    setProducts(p.data.products);setFeatures(p.data.features);setPlans(p.data.plans);setVersions(p.data.versions);
  }
  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:"Catalog workspace could not be loaded."));},[]);

  async function post(url:string,body:Record<string,unknown>,success:string){
    setBusy(true);setError(null);setNotice(null);
    try{
      const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
      const p=await r.json().catch(()=>null);
      if(!r.ok) throw new Error(p?.error||"Catalog action failed.");
      setNotice(success);await load();
    }catch(e){setError(e instanceof Error?e.message:"Catalog action failed.");}
    finally{setBusy(false);}
  }

  async function createProduct(){
    const code=window.prompt("Product code"); if(!code) return;
    const name=window.prompt("Product name"); if(!name) return;
    const reason=window.prompt("Reason for creating product"); if(!reason?.trim()) return;
    await post("/api/platform/catalog/products",{code,name,reason},"Product created in DRAFT state.");
  }
  async function createFeature(){
    if(!products.length){setError("Create a product first.");return;}
    const productId=window.prompt("Product ID",products[0].id); if(!productId) return;
    const key=window.prompt("Feature key"); if(!key) return;
    const name=window.prompt("Feature name"); if(!name) return;
    const reason=window.prompt("Reason for creating feature"); if(!reason?.trim()) return;
    await post("/api/platform/catalog/features",{productId,key,name,reason},"Feature created in DRAFT state.");
  }
  async function createPlan(){
    if(!products.length){setError("Create a product first.");return;}
    const productId=window.prompt("Product ID",products[0].id); if(!productId) return;
    const code=window.prompt("Plan code"); if(!code) return;
    const name=window.prompt("Plan name"); if(!name) return;
    const reason=window.prompt("Reason for creating plan"); if(!reason?.trim()) return;
    await post("/api/platform/catalog/plans",{productId,code,name,reason},"Plan created in DRAFT state.");
  }
  async function createVersion(plan:Plan){
    const reason=window.prompt("Reason for creating a new draft plan version"); if(!reason?.trim()) return;
    await post("/api/platform/catalog/plans/"+encodeURIComponent(plan.id)+"/versions",{reason},"Draft plan version created.");
  }
  async function configure(version:Version){
    const cadence=(window.prompt("Billing cadence: MONTHLY, ANNUAL, or CUSTOM",version.billingCadence??"MONTHLY")||"").toUpperCase();
    if(!["MONTHLY","ANNUAL","CUSTOM"].includes(cadence)) return setError("Billing cadence must be MONTHLY, ANNUAL, or CUSTOM.");
    const currency=(window.prompt("Currency",version.currency??"USD")||"").toUpperCase(); if(!currency) return;
    const amount=Number(window.prompt("Base amount in cents",String(version.baseAmountCents??0))); if(!Number.isInteger(amount)||amount<0) return setError("Base amount must be a non-negative integer.");
    const users=Number(window.prompt("Included full users",String(version.includedFullUsers??0))); if(!Number.isInteger(users)||users<0) return setError("Included users must be a non-negative integer.");
    const addRate=Number(window.prompt("Additional full-user rate in cents",String(version.additionalUserRateCents??0))); if(!Number.isInteger(addRate)||addRate<0) return setError("Additional-user rate must be a non-negative integer.");
    const storage=Number(window.prompt("Storage allowance in GiB",String(version.storageAllowanceGb??0))); if(!Number.isInteger(storage)||storage<0) return setError("Storage allowance must be a non-negative integer.");
    const reason=window.prompt("Reason for setting commercial terms"); if(!reason?.trim()) return;
    setBusy(true);setError(null);setNotice(null);
    try{
      const r=await fetch("/api/platform/catalog/plan-versions/"+encodeURIComponent(version.id)+"/commercial-terms",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({billingCadence:cadence,currency,baseAmountCents:amount,includedFullUsers:users,additionalUserRateCents:addRate,storageAllowanceGb:storage,reason})});
      const p=await r.json().catch(()=>null);if(!r.ok) throw new Error(p?.error||"Commercial terms could not be saved.");
      setNotice("Draft commercial terms saved.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Commercial terms could not be saved.");}
    finally{setBusy(false);}
  }
  async function setFeature(version:Version){
    const eligible=features.filter(f=>plans.find(p=>p.id===version.planId)?.productId===f.productId);
    if(!eligible.length){setError("No compatible feature exists for this plan.");return;}
    const featureId=window.prompt("Feature ID",eligible[0].id); if(!featureId) return;
    const enabled=window.confirm("Enable this feature in the draft plan version? Cancel records it as disabled.");
    const reason=window.prompt("Reason for changing plan feature"); if(!reason?.trim()) return;
    setBusy(true);setError(null);setNotice(null);
    try{
      const r=await fetch("/api/platform/catalog/plan-versions/"+encodeURIComponent(version.id)+"/features",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({featureId,enabled,reason})});
      const p=await r.json().catch(()=>null);if(!r.ok) throw new Error(p?.error||"Plan feature could not be changed.");
      setNotice("Draft plan feature matrix updated.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Plan feature could not be changed.");}
    finally{setBusy(false);}
  }
  async function activate(version:Version){
    if(!window.confirm("Activate this plan version? Activated plan versions and their feature matrix become immutable.")) return;
    const businessApprovalReason=window.prompt("Business approval basis for this pricing/package version"); if(!businessApprovalReason?.trim()) return;
    const reason=window.prompt("Reason for activating plan version"); if(!reason?.trim()) return;
    await post("/api/platform/catalog/plan-versions/"+encodeURIComponent(version.id)+"/activate",{reason,businessApprovalReason},"Plan pricing/package version business-approved, activated, and made immutable.");
  }

  return <article className={styles.card}>
    <h3>Product, module & plan catalog</h3>
    <p>Build commercial packaging as versioned catalog data. Draft plan versions remain editable until explicit activation.</p>
    {canManage?<div>
      <button type="button" disabled={busy} onClick={()=>void createProduct()}>Create product</button>
      <button type="button" disabled={busy} onClick={()=>void createFeature()}>Create feature/module</button>
      <button type="button" disabled={busy} onClick={()=>void createPlan()}>Create plan</button>
    </div>:null}
    <p>{products.length} products · {features.length} features/modules · {plans.length} plans · {versions.length} plan versions</p>
    {plans.map(plan=><div key={plan.id}>
      <strong>{plan.name} · {plan.code} · {plan.status}</strong>
      {canManage?<button type="button" disabled={busy} onClick={()=>void createVersion(plan)}>New draft version</button>:null}
      {versions.filter(v=>v.planId===plan.id).map(version=><div key={version.id}>
        <p>v{version.version} · {version.status} · {version.billingCadence??"terms incomplete"} · {version.currency??""} {version.baseAmountCents!==null?(version.baseAmountCents/100).toFixed(2):""}</p>\n        {version.businessApprovedAt?<p>Business-approved {new Date(version.businessApprovedAt).toLocaleString()} · {version.businessApprovalReason}</p>:<p>Business approval not yet recorded.</p>}
        {canManage&&version.status==="DRAFT"?<>
          <button type="button" disabled={busy} onClick={()=>void configure(version)}>Set commercial terms</button>
          <button type="button" disabled={busy} onClick={()=>void setFeature(version)}>Set feature/module</button>
          <button type="button" disabled={busy} onClick={()=>void activate(version)}>Activate version</button>
        </>:null}
      </div>)}
    </div>)}
    {error?<p role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
  </article>;
}
