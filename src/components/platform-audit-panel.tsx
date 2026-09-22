"use client";

import { useEffect, useState } from "react";
import styles from "./platform-administration-shell.module.css";

type AuditRecord={
  id:string;actorIdentityId:string|null;actorMembershipId:string|null;actorEmail:string|null;
  occurredAt:string;action:string;entityType:string;entityId:string|null;entityVersion:string|null;
  correlationId:string|null;requestId:string|null;reason:string|null;metadata:unknown;
};
type Facet={value:string;count:number};
type Payload={data:AuditRecord[];facets:{actions:Facet[];entityTypes:Facet[]};nextCursor:{occurredAt:string;id:string}|null};

export function PlatformAuditPanel(){
  const [rows,setRows]=useState<AuditRecord[]>([]);
  const [actions,setActions]=useState<Facet[]>([]);
  const [entityTypes,setEntityTypes]=useState<Facet[]>([]);
  const [nextCursor,setNextCursor]=useState<Payload["nextCursor"]>(null);
  const [action,setAction]=useState("");
  const [entityType,setEntityType]=useState("");
  const [actorIdentityId,setActorIdentityId]=useState("");
  const [from,setFrom]=useState("");
  const [to,setTo]=useState("");
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);

  async function load(reset=true){
    setBusy(true);setError(null);
    try{
      const params=new URLSearchParams();
      if(action.trim()) params.set("action",action.trim());
      if(entityType.trim()) params.set("entityType",entityType.trim());
      if(actorIdentityId.trim()) params.set("actorIdentityId",actorIdentityId.trim());
      if(from){const d=new Date(from);if(Number.isNaN(d.getTime())) throw new Error("From date/time is invalid.");params.set("from",d.toISOString());}
      if(to){const d=new Date(to);if(Number.isNaN(d.getTime())) throw new Error("To date/time is invalid.");params.set("to",d.toISOString());}
      if(!reset&&nextCursor){params.set("cursorOccurredAt",nextCursor.occurredAt);params.set("cursorId",nextCursor.id);}
      params.set("limit","100");
      const r=await fetch("/api/platform/audit?"+params.toString(),{cache:"no-store"});
      const p=await r.json().catch(()=>null) as Payload & {error?:string};
      if(!r.ok) throw new Error(p?.error||"Platform audit could not be loaded.");
      setRows(current=>reset?p.data:[...current,...p.data]);
      setActions(p.facets.actions);setEntityTypes(p.facets.entityTypes);setNextCursor(p.nextCursor);
    }catch(e){setError(e instanceof Error?e.message:"Platform audit could not be loaded.");}
    finally{setBusy(false);}
  }

  useEffect(()=>{void Promise.resolve().then(()=>load(true));},[]);

  function clear(){
    setAction("");setEntityType("");setActorIdentityId("");setFrom("");setTo("");
    setTimeout(()=>void load(true),0);
  }

  return <div className={styles.grid}>
    <article className={styles.card}>
      <h3>Immutable platform audit</h3>
      <p>Read-only Trace control-plane history. This browser does not join tenant document, training, quality, laboratory, or other regulated QMS record tables.</p>
      <label>Action contains
        <input value={action} onChange={e=>setAction(e.target.value)} placeholder="customer_account, subscription, support..." />
      </label>
      <label>Entity type
        <input list="platform-audit-entity-types" value={entityType} onChange={e=>setEntityType(e.target.value)} placeholder="CustomerAccount" />
        <datalist id="platform-audit-entity-types">{entityTypes.map(x=><option key={x.value} value={x.value}>{x.count}</option>)}</datalist>
      </label>
      <label>Actor platform identity UUID
        <input value={actorIdentityId} onChange={e=>setActorIdentityId(e.target.value)} placeholder="optional" />
      </label>
      <label>From
        <input type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)} />
      </label>
      <label>To
        <input type="datetime-local" value={to} onChange={e=>setTo(e.target.value)} />
      </label>
      <button type="button" disabled={busy} onClick={()=>void load(true)}>{busy?"Loading…":"Apply filters"}</button>
      <button type="button" disabled={busy} onClick={clear}>Clear filters</button>
      <p>{actions.length} action types · {entityTypes.length} entity types represented in audit facets</p>
    </article>

    <article className={styles.card}>
      <h3>Audit events</h3>
      {rows.length===0?<p>No platform audit events match the current filters.</p>:rows.map(item=><details key={item.id}>
        <summary><strong>{item.action}</strong> · {item.entityType} · {new Date(item.occurredAt).toLocaleString()}</summary>
        <p>Actor: {item.actorEmail||item.actorIdentityId||"System / unattributed"}</p>
        <p>Entity: {item.entityId||"None"}{item.entityVersion?" · version "+item.entityVersion:""}</p>
        <p>Reason: {item.reason||"No reason recorded"}</p>
        <p>Correlation: {item.correlationId||"None"} · Request: {item.requestId||"None"}</p>
        <pre>{JSON.stringify(item.metadata??{},null,2)}</pre>
      </details>)}
      {nextCursor?<button type="button" disabled={busy} onClick={()=>void load(false)}>{busy?"Loading…":"Load older events"}</button>:<p>End of current audit result set.</p>}
    </article>

    {error?<div className={styles.error} role="alert">{error}</div>:null}
  </div>;
}
