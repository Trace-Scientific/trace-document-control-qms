"use client";

import { useEffect, useState } from "react";
import styles from "./platform-administration-shell.module.css";

type Plan={id:string;code:string;name:string;status:string;createdAt:string;updatedAt:string};
type Version={id:string;commissionPlanId:string;version:number;status:string;effectiveFrom:string;effectiveTo:string|null;activatedAt:string|null};
type Rule={id:string;commissionPlanVersionId:string;ruleCode:string;ruleType:"PERCENTAGE"|"FIXED";rate:string|null;fixedAmount:string|null;currency:string;description:string};
type Assignment={id:string;salesRepresentativeId:string;salesRepresentativeName:string;customerAccountId:string;customerName:string;startsAt:string;endsAt:string|null};
type Accrual={id:string;salesRepresentativeId:string;salesRepresentativeName:string;customerAccountId:string;customerName:string;status:"PENDING"|"EARNED"|"APPROVED"|"PAID";sourceType:string;sourceReference:string;basisAmount:string|number;commissionAmount:string|number;currency:string;lockVersion:number;createdAt:string};

export function PlatformCommissionsPanel({canManage}:{canManage:boolean}){
  const [plans,setPlans]=useState<Plan[]>([]);
  const [versions,setVersions]=useState<Version[]>([]);
  const [rules,setRules]=useState<Rule[]>([]);
  const [assignments,setAssignments]=useState<Assignment[]>([]);
  const [accruals,setAccruals]=useState<Accrual[]>([]);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);

  async function load(){
    const r=await fetch("/api/platform/commissions/workspace",{cache:"no-store"});
    const p=await r.json().catch(()=>null);
    if(!r.ok) throw new Error(p?.error||"Commission workspace could not be loaded.");
    setPlans(p.data.plans);setVersions(p.data.versions);setRules(p.data.rules);setAssignments(p.data.assignments);setAccruals(p.data.accruals);
  }
  useEffect(()=>{void Promise.resolve().then(()=>load()).catch(e=>setError(e instanceof Error?e.message:"Commission workspace could not be loaded."));},[]);

  async function post(url:string,body:Record<string,unknown>,success:string){
    setBusy(true);setError(null);setNotice(null);
    try{
      const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
      const p=await r.json().catch(()=>null);
      if(!r.ok) throw new Error(p?.error||"Commission action failed.");
      setNotice(success);await load();
    }catch(e){setError(e instanceof Error?e.message:"Commission action failed.");}
    finally{setBusy(false);}
  }

  async function createPlan(){
    const code=window.prompt("Commission plan code"); if(!code?.trim()) return;
    const name=window.prompt("Commission plan name"); if(!name?.trim()) return;
    const reason=window.prompt("Reason for creating commission plan"); if(!reason?.trim()) return;
    await post("/api/platform/commissions/plans",{code,name,reason},"Commission plan created in DRAFT state.");
  }

  async function createVersion(plan:Plan){
    const existing=versions.filter(v=>v.commissionPlanId===plan.id);
    const nextVersion=Math.max(0,...existing.map(v=>v.version))+1;
    const raw=window.prompt("Version number",String(nextVersion)); if(!raw) return;
    const version=Number(raw); if(!Number.isInteger(version)||version<1){setError("Version must be a positive integer.");return;}
    const effectiveFromInput=window.prompt("Effective from (ISO)",new Date().toISOString()); if(!effectiveFromInput) return;
    const effectiveFrom=new Date(effectiveFromInput); if(Number.isNaN(effectiveFrom.getTime())){setError("Effective-from value is invalid.");return;}
    const effectiveToInput=window.prompt("Effective to (ISO, optional)","");
    let effectiveTo:string|null=null;
    if(effectiveToInput&&effectiveToInput.trim()){const parsed=new Date(effectiveToInput);if(Number.isNaN(parsed.getTime())){setError("Effective-to value is invalid.");return;}effectiveTo=parsed.toISOString();}
    const reason=window.prompt("Reason for creating plan version"); if(!reason?.trim()) return;
    await post("/api/platform/commissions/plans/"+encodeURIComponent(plan.id)+"/versions",{version,effectiveFrom:effectiveFrom.toISOString(),effectiveTo,reason},"Draft commission plan version created.");
  }

  async function addRule(version:Version){
    const ruleCode=window.prompt("Rule code"); if(!ruleCode?.trim()) return;
    const ruleType=(window.prompt("Rule type: PERCENTAGE or FIXED","PERCENTAGE")||"").toUpperCase();
    if(ruleType!=="PERCENTAGE"&&ruleType!=="FIXED"){setError("Rule type must be PERCENTAGE or FIXED.");return;}
    let rate:number|null=null,fixedAmount:number|null=null;
    if(ruleType==="PERCENTAGE"){
      const raw=window.prompt("Rate as decimal (example: 0.10 for 10%)","0.10"); if(raw===null) return;
      rate=Number(raw); if(!Number.isFinite(rate)||rate<0){setError("Rate must be nonnegative.");return;}
    }else{
      const raw=window.prompt("Fixed amount","0"); if(raw===null) return;
      fixedAmount=Number(raw); if(!Number.isFinite(fixedAmount)||fixedAmount<0){setError("Fixed amount must be nonnegative.");return;}
    }
    const currency=(window.prompt("Currency","USD")||"").toUpperCase(); if(!/^[A-Z]{3}$/.test(currency)){setError("Currency must be a 3-letter code.");return;}
    const description=window.prompt("Rule description"); if(!description?.trim()) return;
    const reason=window.prompt("Reason for adding rule"); if(!reason?.trim()) return;
    await post("/api/platform/commissions/plan-versions/"+encodeURIComponent(version.id)+"/rules",{ruleCode,ruleType,rate,fixedAmount,currency,description,reason},"Draft commission rule added.");
  }

  async function activate(version:Version){
    if(!window.confirm("Activate this commission plan version? Its rules become immutable historical configuration.")) return;
    const reason=window.prompt("Reason for activating commission plan version"); if(!reason?.trim()) return;
    await post("/api/platform/commissions/plan-versions/"+encodeURIComponent(version.id)+"/activate",{reason},"Commission plan version activated.");
  }

  async function createAccrual(){
    const activeAssignments=assignments.filter(a=>new Date(a.startsAt)<=new Date()&&(!a.endsAt||new Date(a.endsAt)>new Date()));
    const activeVersionIds=new Set(versions.filter(v=>v.status==="ACTIVE"&&new Date(v.effectiveFrom)<=new Date()&&(!v.effectiveTo||new Date(v.effectiveTo)>new Date())).map(v=>v.id));
    const activeRules=rules.filter(r=>activeVersionIds.has(r.commissionPlanVersionId));
    if(!activeAssignments.length||!activeRules.length){setError("An active sales assignment and active commission rule are required.");return;}
    const salesAssignmentId=window.prompt("Active sales assignment ID",activeAssignments[0].id); if(!salesAssignmentId) return;
    const commissionRuleId=window.prompt("Active commission rule ID",activeRules[0].id); if(!commissionRuleId) return;
    const sourceType=window.prompt("Source type (for example SUBSCRIPTION)","SUBSCRIPTION"); if(!sourceType?.trim()) return;
    const sourceReference=window.prompt("Source reference"); if(!sourceReference?.trim()) return;
    const raw=window.prompt("Commission basis amount","0"); if(raw===null) return;
    const basisAmount=Number(raw); if(!Number.isFinite(basisAmount)||basisAmount<0){setError("Basis amount must be nonnegative.");return;}
    const reason=window.prompt("Reason for creating commission accrual"); if(!reason?.trim()) return;
    await post("/api/platform/commissions/accruals",{salesAssignmentId,commissionRuleId,sourceType,sourceReference,basisAmount,reason},"Commission accrual created with rule snapshot preserved.");
  }

  async function transition(item:Accrual,toStatus:"EARNED"|"APPROVED"){
    const reason=window.prompt("Reason for changing "+item.customerName+" commission from "+item.status+" to "+toStatus); if(!reason?.trim()) return;
    await post("/api/platform/commissions/accruals/"+encodeURIComponent(item.id)+"/transition",{toStatus,expectedLockVersion:item.lockVersion,reason},"Commission accrual changed to "+toStatus+".");
  }

  async function adjust(item:Accrual){
    const type=(window.prompt("Type: ADJUSTMENT or REVERSAL","ADJUSTMENT")||"").toUpperCase();
    if(type!=="ADJUSTMENT"&&type!=="REVERSAL"){setError("Adjustment type is invalid.");return;}
    const raw=window.prompt("Adjustment amount","0"); if(raw===null) return;
    const amount=Number(raw); if(!Number.isFinite(amount)||amount===0){setError("Adjustment amount must be nonzero.");return;}
    const reason=window.prompt("Reason for adjustment/reversal"); if(!reason?.trim()) return;
    await post("/api/platform/commissions/accruals/"+encodeURIComponent(item.id)+"/adjustments",{type,amount,currency:item.currency,reason},"Commission adjustment evidence recorded.");
  }

  async function pay(item:Accrual){
    const paymentReference=window.prompt("Payment reference"); if(!paymentReference?.trim()) return;
    const reason=window.prompt("Reason for recording commission payment"); if(!reason?.trim()) return;
    await post("/api/platform/commissions/accruals/"+encodeURIComponent(item.id)+"/payment",{expectedLockVersion:item.lockVersion,paymentReference,paidAt:new Date().toISOString(),reason},"Commission payment recorded and accrual marked PAID.");
  }

  return <div className={styles.grid}>
    <article className={styles.card}>
      <h3>Versioned commission plans</h3>
      <p>Draft plan versions and rules remain editable until explicit activation. Activated versions become immutable historical commission configuration.</p>
      {canManage?<button type="button" disabled={busy} onClick={()=>void createPlan()}>Create commission plan</button>:null}
      {plans.length===0?<p>No commission plans configured.</p>:plans.map(plan=><div key={plan.id}>
        <strong>{plan.name} · {plan.code} · {plan.status}</strong>
        {canManage?<button type="button" disabled={busy} onClick={()=>void createVersion(plan)}>New draft version</button>:null}
        {versions.filter(v=>v.commissionPlanId===plan.id).map(version=><div key={version.id}>
          <p>v{version.version} · {version.status} · effective {new Date(version.effectiveFrom).toLocaleDateString()}</p>
          {rules.filter(r=>r.commissionPlanVersionId===version.id).map(rule=><p key={rule.id}>{rule.ruleCode} · {rule.ruleType} · {rule.currency}</p>)}
          {canManage&&version.status==="DRAFT"?<>
            <button type="button" disabled={busy} onClick={()=>void addRule(version)}>Add rule</button>
            <button type="button" disabled={busy} onClick={()=>void activate(version)}>Activate version</button>
          </>:null}
        </div>)}
      </div>)}
    </article>

    <article className={styles.card}>
      <h3>Commission accruals</h3>
      <p>Accruals preserve the applied rule snapshot and progress through governed lifecycle states with optimistic locking and audit evidence.</p>
      {canManage?<button type="button" disabled={busy} onClick={()=>void createAccrual()}>Create commission accrual</button>:null}
      {accruals.length===0?<p>No commission accruals recorded.</p>:accruals.map(item=><div key={item.id}>
        <strong>{item.salesRepresentativeName} · {item.customerName}</strong>
        <p>{item.status} · basis {item.currency} {Number(item.basisAmount).toFixed(2)} · commission {item.currency} {Number(item.commissionAmount).toFixed(2)}</p>
        {canManage&&item.status==="PENDING"?<button type="button" disabled={busy} onClick={()=>void transition(item,"EARNED")}>Mark earned</button>:null}
        {canManage&&item.status==="EARNED"?<button type="button" disabled={busy} onClick={()=>void transition(item,"APPROVED")}>Approve</button>:null}
        {canManage&&item.status!=="PAID"?<button type="button" disabled={busy} onClick={()=>void adjust(item)}>Adjustment / reversal</button>:null}
        {canManage&&item.status==="APPROVED"?<button type="button" disabled={busy} onClick={()=>void pay(item)}>Record payment</button>:null}
      </div>)}
    </article>

    {error?<div className={styles.error} role="alert">{error}</div>:null}
    {notice?<div className={styles.notice} role="status">{notice}</div>:null}
  </div>;
}
