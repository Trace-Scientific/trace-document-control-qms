"use client";

import { useEffect, useState } from "react";
import styles from "./platform-administration-shell.module.css";

type Customer={id:string;accountCode:string;displayName:string;legalName:string;status:string;organizationId:string|null};
type Representative={id:string;platformIdentityId:string;displayName:string;status:string;createdAt:string;updatedAt:string};
type Assignment={id:string;salesRepresentativeId:string;salesRepresentativeName:string;customerAccountId:string;customerName:string;startsAt:string;endsAt:string|null;createdAt:string};
type Identity={id:string;email:string;status:string};

export function PlatformSalesPanel({customers,canManage}:{customers:Customer[];canManage:boolean}){
  const [representatives,setRepresentatives]=useState<Representative[]>([]);
  const [assignments,setAssignments]=useState<Assignment[]>([]);
  const [identities,setIdentities]=useState<Identity[]>([]);
  const [scope,setScope]=useState<"ADMIN"|"SELF">("SELF");
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);

  async function load(){
    const r=await fetch("/api/platform/sales/workspace",{cache:"no-store"});
    const p=await r.json().catch(()=>null);
    if(!r.ok) throw new Error(p?.error||"Sales workspace could not be loaded.");
    setRepresentatives(p.data.representatives);
    setAssignments(p.data.assignments);
    setIdentities(p.data.identities);
    setScope(p.data.scope);
  }

  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:"Sales workspace could not be loaded."));},[]);

  async function createRepresentative(){
    if(!identities.length){setError("No active platform identity is available.");return;}
    const platformIdentityId=window.prompt("Active platform identity ID",identities[0].id); if(!platformIdentityId) return;
    const displayName=window.prompt("Sales representative display name"); if(!displayName?.trim()) return;
    const reason=window.prompt("Reason for creating sales representative"); if(!reason?.trim()) return;
    setBusy(true);setError(null);setNotice(null);
    try{
      const r=await fetch("/api/platform/sales/representatives",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({platformIdentityId,displayName,reason})});
      const p=await r.json().catch(()=>null); if(!r.ok) throw new Error(p?.error||"Sales representative could not be created.");
      setNotice("Sales representative created. No tenant QMS access was granted.");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Sales representative could not be created.");}
    finally{setBusy(false);}
  }

  async function createAssignment(){
    if(!representatives.length){setError("Create an active sales representative first.");return;}
    const eligible=customers.filter(c=>c.status!=="TERMINATED");
    if(!eligible.length){setError("No non-terminated customer is available.");return;}
    const salesRepresentativeId=window.prompt("Sales representative ID",representatives[0].id); if(!salesRepresentativeId) return;
    const customerAccountId=window.prompt("Customer account ID",eligible[0].id); if(!customerAccountId) return;
    const startsAtInput=window.prompt("Assignment start date/time (ISO)",new Date().toISOString()); if(!startsAtInput) return;
    const startsAt=new Date(startsAtInput); if(Number.isNaN(startsAt.getTime())){setError("Start date/time is invalid.");return;}
    const endsAtInput=window.prompt("Assignment end date/time (ISO, optional)","");
    let endsAt:string|null=null;
    if(endsAtInput&&endsAtInput.trim()){const parsed=new Date(endsAtInput);if(Number.isNaN(parsed.getTime())){setError("End date/time is invalid.");return;}endsAt=parsed.toISOString();}
    const reason=window.prompt("Reason for assigning this customer"); if(!reason?.trim()) return;
    setBusy(true);setError(null);setNotice(null);
    try{
      const r=await fetch("/api/platform/sales/assignments",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({salesRepresentativeId,customerAccountId,startsAt:startsAt.toISOString(),endsAt,reason})});
      const p=await r.json().catch(()=>null); if(!r.ok) throw new Error(p?.error||"Sales assignment could not be created.");
      setNotice("Effective-dated customer sales assignment created. Historical ownership remains preserved.");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Sales assignment could not be created.");}
    finally{setBusy(false);}
  }

  function assignmentWindow(item:Assignment){
    return item.endsAt
      ? new Date(item.startsAt).toLocaleString()+" through "+new Date(item.endsAt).toLocaleString()
      : new Date(item.startsAt).toLocaleString()+" · current/open-ended";
  }

  return <div className={styles.grid}>
    <article className={styles.card}>
      <h3>Sales representatives</h3>
      <p>Trace-side sales representative profiles are linked to active platform identities only. Sales ownership does not grant tenant QMS access.</p>
      <p>{scope==="ADMIN"?"Administrative sales scope: all representatives and customer assignments are visible.":"Sales representative scope: only your linked representative profile and assigned customer accounts are visible."}</p>
      {canManage?<button type="button" disabled={busy} onClick={()=>void createRepresentative()}>Create sales representative</button>:null}
      {representatives.length===0?<p>No sales representatives configured.</p>:representatives.map(item=><p key={item.id}><strong>{item.displayName}</strong> · {item.status}</p>)}
    </article>

    <article className={styles.card}>
      <h3>Customer attribution</h3>
      <p>Assignments are effective-dated. Overlapping ownership for the same customer is rejected so historical commission attribution stays reproducible.</p>
      {canManage?<button type="button" disabled={busy} onClick={()=>void createAssignment()}>Assign customer</button>:null}
      {assignments.length===0?<p>No sales assignments configured.</p>:assignments.map(item=><div key={item.id}>
        <strong>{item.customerName} → {item.salesRepresentativeName}</strong>
        <p>{assignmentWindow(item)}</p>
      </div>)}
    </article>

    {error?<div className={styles.error} role="alert">{error}</div>:null}
    {notice?<div className={styles.notice} role="status">{notice}</div>:null}
  </div>;
}
