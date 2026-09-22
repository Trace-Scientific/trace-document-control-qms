"use client";

import { useEffect, useState } from "react";

type CaseItem={id:string;customerAccountId:string;customerName:string;targetOrganizationId:string;organizationName:string;caseNumber:string;title:string;status:"OPEN"|"CLOSED";openedAt:string;closedAt:string|null};
type RequestItem={id:string;caseId:string;caseNumber:string;organizationName:string;requestedByMembershipId:string;requesterEmail:string;reason:string;status:"PENDING"|"APPROVED"|"DENIED"|"CANCELLED";requestedAt:string;requestedExpiresAt:string;capabilities:string[]};
type SessionItem={id:string;requestId:string;caseId:string;caseNumber:string;organizationName:string;actorMembershipId:string;actorEmail:string;status:"ACTIVE"|"ENDED"|"REVOKED"|"EXPIRED";issuedAt:string;expiresAt:string;endedAt:string|null;capabilities:string[]};
type Workspace={permissions:{canRequest:boolean;canApprove:boolean;canAccess:boolean};currentMembershipId:string;cases:CaseItem[];requests:RequestItem[];sessions:SessionItem[]};
type ActiveSession={supportSessionId:string;supportCaseId:string;targetOrganizationId:string;targetOrganizationName:string;expiresAt:string;capabilities:string[]};

export function SupportAccessOperations(){
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [activeSession,setActiveSession]=useState<ActiveSession|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);

  async function load(){
    const r=await fetch("/api/platform/support/workspace",{cache:"no-store"});
    const p=await r.json().catch(()=>null);
    if(!r.ok) throw new Error(p?.error||"Controlled support workspace could not be loaded.");
    setWorkspace(p.data);
    const active=await fetch("/api/platform/support/sessions",{cache:"no-store"});
    if(active.ok){
      const body=await active.json() as {data:ActiveSession};
      setActiveSession(body.data);
    }else{
      setActiveSession(null);
    }
  }

  useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:"Controlled support workspace could not be loaded."));},[]);

  async function requestAccess(item:CaseItem){
    const durationRaw=window.prompt("Support-session duration in minutes (5-240)","60"); if(durationRaw===null) return;
    const durationMinutes=Number(durationRaw);
    if(!Number.isInteger(durationMinutes)||durationMinutes<5||durationMinutes>240){setError("Duration must be an integer from 5 through 240 minutes.");return;}
    const capRaw=window.prompt("Capabilities, comma-separated: support.tenant.read, support.tenant.troubleshoot, support.tenant.safe_write","support.tenant.read,support.tenant.troubleshoot");
    if(capRaw===null) return;
    const allowed=["support.tenant.read","support.tenant.troubleshoot","support.tenant.safe_write"];
    const capabilities=[...new Set(capRaw.split(",").map(x=>x.trim()).filter(Boolean))];
    if(!capabilities.length||capabilities.some(x=>!allowed.includes(x))){setError("One or more support capabilities are invalid.");return;}
    const reason=window.prompt("Reason tenant access is required for case "+item.caseNumber); if(!reason?.trim()) return;
    await post("/api/platform/support/requests",{caseId:item.id,reason,durationMinutes,capabilities},"Support access request created. A different authorized platform member must approve it.");
  }

  async function decide(item:RequestItem,decision:"APPROVED"|"DENIED"){
    const reason=window.prompt((decision==="APPROVED"?"Approval":"Denial")+" reason for request "+item.id.slice(0,8)); if(!reason?.trim()) return;
    await post("/api/platform/support/requests/"+encodeURIComponent(item.id)+"/decision",{decision,reason},decision==="APPROVED"?"Support access approved.":"Support access denied.");
  }

  async function assume(item:RequestItem){
    const reason=window.prompt("Reason for starting the approved support session"); if(!reason?.trim()) return;
    await post("/api/platform/support/sessions",{requestId:item.id,reason},"Controlled support session started. The support banner now identifies the tenant context.");
  }

  async function exit(){
    const reason=window.prompt("Reason for exiting the controlled support session"); if(!reason?.trim()) return;
    setBusy(true);setError(null);setNotice(null);
    try{
      const r=await fetch("/api/platform/support/sessions",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({reason})});
      const p=await r.json().catch(()=>null); if(!r.ok) throw new Error(p?.error||"Support session could not be exited.");
      setNotice("Controlled support session exited and cookie cleared.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Support session could not be exited.");}
    finally{setBusy(false);}
  }

  async function revoke(item:SessionItem){
    const reason=window.prompt("Reason for revoking support session "+item.id.slice(0,8)); if(!reason?.trim()) return;
    await post("/api/platform/support/sessions/"+encodeURIComponent(item.id)+"/revoke",{reason},"Controlled support session revoked.");
  }

  async function closeCase(item:CaseItem){
    const reason=window.prompt("Reason for closing support case "+item.caseNumber); if(!reason?.trim()) return;
    await post("/api/platform/support/cases/"+encodeURIComponent(item.id)+"/close",{reason},"Support case closed.");
  }

  async function post(url:string,body:Record<string,unknown>,success:string){
    setBusy(true);setError(null);setNotice(null);
    try{
      const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
      const p=await r.json().catch(()=>null); if(!r.ok) throw new Error(p?.error||"Controlled support action failed.");
      setNotice(success);await load();
    }catch(e){setError(e instanceof Error?e.message:"Controlled support action failed.");}
    finally{setBusy(false);}
  }

  if(!workspace) return <section><p>Loading controlled support access…</p>{error?<p role="alert">{error}</p>:null}</section>;

  const {canRequest,canApprove,canAccess}=workspace.permissions;

  return <section style={{display:"grid",gap:20}}>
    <div style={{border:"1px solid currentColor",padding:16}}>
      <h2>Controlled support workflow</h2>
      <p>Tenant access requires an open case, an explicit access request, approval by a different authorized platform member, and a requester-bound time-limited session.</p>
      <p><strong>Your authority:</strong> {[
        canRequest?"request":null,
        canApprove?"approve/revoke":null,
        canAccess?"assume/exit":null,
      ].filter(Boolean).join(" · ")||"none"}</p>
      {activeSession?<div>
        <p><strong>Active session:</strong> {activeSession.targetOrganizationName} · expires {new Date(activeSession.expiresAt).toLocaleString()}</p>
        <button type="button" disabled={busy} onClick={()=>void exit()}>Exit support session</button>
      </div>:<p>No active support session is currently assumed in this browser.</p>}
    </div>

    <div style={{border:"1px solid currentColor",padding:16}}>
      <h2>Support cases</h2>
      {workspace.cases.length===0?<p>No controlled support cases exist.</p>:workspace.cases.map(item=><div key={item.id} style={{padding:"12px 0",borderBottom:"1px solid #ccc"}}>
        <strong>{item.caseNumber} · {item.organizationName}</strong>
        <p>{item.title} · {item.status}</p>
        <p>Customer account: {item.customerName}</p>
        {canRequest&&item.status==="OPEN"?<button type="button" disabled={busy} onClick={()=>void requestAccess(item)}>Request tenant access</button>:null}
        {canRequest&&item.status==="OPEN"?<button type="button" disabled={busy} onClick={()=>void closeCase(item)}>Close case</button>:null}
      </div>)}
    </div>

    <div style={{border:"1px solid currentColor",padding:16}}>
      <h2>Access requests</h2>
      {workspace.requests.length===0?<p>No support access requests exist.</p>:workspace.requests.map(item=>{
        const own=item.requestedByMembershipId===workspace.currentMembershipId;
        return <div key={item.id} style={{padding:"12px 0",borderBottom:"1px solid #ccc"}}>
          <strong>{item.caseNumber} · {item.organizationName} · {item.status}</strong>
          <p>Requester: {item.requesterEmail} · expires {new Date(item.requestedExpiresAt).toLocaleString()}</p>
          <p>Capabilities: {item.capabilities.join(", ")}</p>
          <p>Reason: {item.reason}</p>
          {canApprove&&item.status==="PENDING"&&!own?<>
            <button type="button" disabled={busy} onClick={()=>void decide(item,"APPROVED")}>Approve</button>
            <button type="button" disabled={busy} onClick={()=>void decide(item,"DENIED")}>Deny</button>
          </>:null}
          {canApprove&&item.status==="PENDING"&&own?<p>A different authorized platform member must decide this request.</p>:null}
          {canAccess&&item.status==="APPROVED"&&own&&!workspace.sessions.some(s=>s.requestId===item.id)?<button type="button" disabled={busy||Boolean(activeSession)} onClick={()=>void assume(item)}>Start support session</button>:null}
        </div>;
      })}
    </div>

    <div style={{border:"1px solid currentColor",padding:16}}>
      <h2>Session history</h2>
      {workspace.sessions.length===0?<p>No controlled support sessions are visible to your authority.</p>:workspace.sessions.map(item=><div key={item.id} style={{padding:"12px 0",borderBottom:"1px solid #ccc"}}>
        <strong>{item.caseNumber} · {item.organizationName} · {item.status}</strong>
        <p>Actor: {item.actorEmail} · issued {new Date(item.issuedAt).toLocaleString()} · expires {new Date(item.expiresAt).toLocaleString()}</p>
        <p>Capabilities: {item.capabilities.join(", ")}</p>
        {canApprove&&item.status==="ACTIVE"?<button type="button" disabled={busy} onClick={()=>void revoke(item)}>Revoke active session</button>:null}
      </div>)}
    </div>

    {error?<p role="alert">{error}</p>:null}
    {notice?<p role="status">{notice}</p>:null}
  </section>;
}
