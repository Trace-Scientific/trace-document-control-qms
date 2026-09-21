"use client";
import { useEffect, useState } from "react";
import styles from "./platform-administration-shell.module.css";

type Row={slug:string;title:string;status:string;published:boolean};

export function PlatformReviewedHelpBaselinePanel(){
  const [rows,setRows]=useState<Row[]>([]);
  const [busy,setBusy]=useState<null|"assemble"|"publish">(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);

  async function load(){
    const r=await fetch("/api/platform/help/reviewed-baseline",{cache:"no-store"});
    const p=await r.json();
    if(!r.ok) throw new Error(p.error||"Reviewed Help baseline could not be loaded");
    setRows(p.data);
  }

  async function act(action:"assemble"|"publish"){
    const label=action==="assemble"?"assembling the reviewed Help baseline":"publishing the reviewed Help baseline";
    const reason=window.prompt(`Reason for ${label}`);
    if(!reason?.trim()) return;
    if(action==="publish"&&!window.confirm("Publish the reviewed Help baseline to authenticated QMS users? This is an explicit content-publication action.")) return;
    setBusy(action);setError(null);setNotice(null);
    try{
      const r=await fetch("/api/platform/help/reviewed-baseline",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,reason})});
      const p=await r.json().catch(()=>null);
      if(!r.ok) throw new Error(p?.error||"Help baseline action failed");
      setNotice(action==="assemble"?`Reviewed Help baseline assembled. ${p?.data?.articleCount??0} articles checked; ${p?.data?.created??0} created and ${p?.data?.revised??0} revised.`:`Reviewed Help baseline published: ${p?.data?.published??0} articles.`);
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Help baseline action failed");}
    finally{setBusy(null);}
  }

  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:"Reviewed Help baseline could not be loaded"));},[]);
  const assembled=rows.length>0&&rows.every(r=>r.status!=="MISSING");
  const published=rows.length>0&&rows.every(r=>r.published);
  return <article className={styles.card}>
    <h3>Reviewed operational Help baseline</h3>
    <p>Governed launch guidance for documents, reviews, records, personnel, training, quality, equipment, reporting, and administration.</p>
    {error?<p role="alert">{error}</p>:null}
    {notice?<p role="status">{notice}</p>:null}
    <p>{rows.length} baseline articles · {rows.filter(r=>r.published).length} published</p>
    <button type="button" disabled={busy!==null} onClick={()=>void act("assemble")}>{busy==="assemble"?"Assembling…":assembled?"Reconcile reviewed Help baseline":"Assemble reviewed Help baseline"}</button>
    <button type="button" disabled={busy!==null||!assembled||published} onClick={()=>void act("publish")}>{busy==="publish"?"Publishing…":published?"Reviewed Help baseline published":"Publish reviewed Help baseline"}</button>
    <p>Assembly creates or reconciles draft revisions only. Publication is a separate explicit platform.help.manage action.</p>
  </article>;
}
