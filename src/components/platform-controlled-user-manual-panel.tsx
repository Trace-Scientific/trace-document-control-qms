"use client";
import { useEffect, useState } from "react";
import styles from "./platform-administration-shell.module.css";
import { CONTROLLED_USER_MANUAL } from "@/lib/platform/controlled-user-manual";

type Manual = { id:string; code:string; name:string; description:string|null; sectionCount:number; releaseCount:number; latestPublishedAt:string|null };
type Detail = { manual: Manual; sections:Array<{id:string;sectionCode:string;title:string;latestRevisionNumber:number|null;revisionCount:number}>; releases:Array<{id:string;version:string;status:string;effectiveAt:string|null;sectionCount:number;publishedAt:string|null}> };

export function PlatformControlledUserManualPanel() {
  const [manuals,setManuals]=useState<Manual[]>([]); const [detail,setDetail]=useState<Detail|null>(null); const [error,setError]=useState<string|null>(null); const [notice,setNotice]=useState<string|null>(null); const [busy,setBusy]=useState(false);
  const assembledDraft=detail?.releases.find((release)=>release.version==="0.1"&&release.status==="DRAFT"&&release.effectiveAt===null&&release.sectionCount===CONTROLLED_USER_MANUAL.sections.length);
  async function load() { const r=await fetch("/api/platform/help/manuals",{cache:"no-store"}); const p=await r.json(); if(!r.ok) throw new Error(p.error||"Manual inventory could not be loaded"); const inventory=p.data as Manual[]; setManuals(inventory); const controlled=inventory.find((manual)=>manual.code===CONTROLLED_USER_MANUAL.code); if(controlled) await open(controlled.id); }
  async function open(id:string) { const r=await fetch(`/api/platform/help/manuals/${encodeURIComponent(id)}`,{cache:"no-store"}); const p=await r.json(); if(!r.ok) throw new Error(p.error||"Manual could not be loaded"); setDetail(p.data); }
  async function assemble() {
    const reason=window.prompt("Reason for assembling the reviewed UM-QMS-001 draft release");
    if(!reason?.trim()) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const r=await fetch("/api/platform/help/manuals/assemble-reviewed-draft",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reason})});
      const p=await r.json().catch(()=>null) as {data?:{sectionCount?:number;version?:string;revisionsCreated?:number};error?:string}|null;
      if(!r.ok) throw new Error(p?.error||"Reviewed draft could not be assembled");
      setNotice(`Draft v${p?.data?.version ?? "0.1"} assembled with ${p?.data?.sectionCount ?? 0} sections; ${p?.data?.revisionsCreated ?? 0} new revisions created. It is not published or effective.`);
      await load();
      const current=(await fetch("/api/platform/help/manuals",{cache:"no-store"}).then(r=>r.json())).data as Manual[];
      const manual=current.find((m)=>m.code===CONTROLLED_USER_MANUAL.code);
      if(manual) await open(manual.id);
    } catch(e){ setError(e instanceof Error?e.message:"Reviewed draft could not be assembled"); }
    finally { setBusy(false); }
  }
  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:"Manual inventory could not be loaded"));},[]);
  return <div className={styles.grid}>
    <article className={styles.card}>
      <h3>Controlled user manual</h3>
      <p>The authoritative launch manual is <strong>{CONTROLLED_USER_MANUAL.code}</strong> — {CONTROLLED_USER_MANUAL.name}. Draft section revisions remain separate from published effective releases.</p>
      <p>Expected baseline: {CONTROLLED_USER_MANUAL.sections.length} controlled sections covering user operation, administration, evidence handling, Help, and support boundaries.</p>
      {error ? <p>{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {manuals.length===0 ? <button type="button" disabled={busy} onClick={()=>void assemble()}>{busy ? "Assembling…" : "Assemble reviewed draft v0.1"}</button> : assembledDraft ? <p role="status"><strong>Reviewed draft v0.1 is already assembled.</strong> It remains DRAFT, unscheduled, and unpublished.</p> : detail ? <p role="alert">Existing UM-QMS-001 does not match the expected reviewed DRAFT v0.1 baseline. Reconcile its controlled release state before assembly.</p> : <p role="status">Verifying reviewed draft readiness…</p>}
      {manuals.map(m=><button key={m.id} type="button" onClick={()=>void open(m.id).catch(e=>setError(e instanceof Error?e.message:"Manual could not be loaded"))}>{m.code} · {m.name} · {m.sectionCount} sections · {m.releaseCount} releases</button>)}
      {manuals.length===0 ? <p>No controlled manual has been authored yet. Use the governed manual APIs to create {CONTROLLED_USER_MANUAL.code}, its sections, revisions, and draft release before publication.</p> : null}
    </article>
    <article className={styles.card}>
      <h3>Release readiness</h3>
      {!detail ? <p>Select a manual to inspect its controlled composition and release state.</p> : <>
        <p><strong>{detail.manual.code}</strong> · {detail.manual.name}</p>
        <p>Sections: {detail.sections.length} · Releases: {detail.releases.length}</p>
        {detail.releases.map(r=><p key={r.id}><strong>v{r.version}</strong> · {r.status} · effective {r.effectiveAt ? new Date(r.effectiveAt).toLocaleString() : "Not scheduled"} · {r.sectionCount} frozen sections</p>)}
      </>}
      <p>Publication remains an explicit platform.help.manage action. Publishing does not change tenant RBAC, signatures, approvals, or QMS records.</p>
    </article>
  </div>;
}
