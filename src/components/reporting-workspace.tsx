"use client";
import { useEffect,useMemo,useState } from "react";

type SourceKey="QUALITY_EVENT_SUMMARY"|"EQUIPMENT_SUMMARY";
type Definition={id:string;code:string;name:string;sourceKey:SourceKey};
type Execution={id:string;reportCode:string;reportName:string;rowCount:number;executedAt:string};
type Finalized={id:string;reportExecutionId:string;reportCode:string;reportName:string;rowCount:number;finalizedAt:string};
type SavedView={id:string;reportDefinitionId:string;name:string;parameters:{status?:string};createdAt:string;updatedAt:string};

const statusOptions:Record<SourceKey,readonly string[]>={
  QUALITY_EVENT_SUMMARY:["OPEN","INVESTIGATING","ACTION_REQUIRED","VERIFICATION","CLOSED"],
  EQUIPMENT_SUMMARY:["PLANNED","ACTIVE","OUT_OF_SERVICE","RETIRED"],
};
const sourceLabels:Record<SourceKey,string>={QUALITY_EVENT_SUMMARY:"Quality Event status summary",EQUIPMENT_SUMMARY:"Equipment status summary"};

export function ReportingWorkspace({canManage,canExport}:{canManage:boolean;canExport:boolean}){
  const [definitions,setDefinitions]=useState<Definition[]>([]),[selected,setSelected]=useState<string>(""),[status,setStatus]=useState(""),[executions,setExecutions]=useState<Execution[]>([]),[finalized,setFinalized]=useState<Finalized[]>([]),[savedViews,setSavedViews]=useState<SavedView[]>([]),[savedViewId,setSavedViewId]=useState(""),[savedViewName,setSavedViewName]=useState(""),[message,setMessage]=useState("");
  const [newCode,setNewCode]=useState(""),[newName,setNewName]=useState(""),[newDescription,setNewDescription]=useState(""),[newSource,setNewSource]=useState<SourceKey>("QUALITY_EVENT_SUMMARY");
  const selectedDefinition=useMemo(()=>definitions.find(definition=>definition.id===selected)??null,[definitions,selected]);
  const allowedStatuses=selectedDefinition?statusOptions[selectedDefinition.sourceKey]:[];
  const loadDefinitions=async()=>{const r=await fetch("/api/reporting");if(r.ok){const data=(await r.json()).data??[];setDefinitions(data);return data as Definition[];}return[];};
  const loadExecutions=async(id:string)=>{const r=await fetch(`/api/reporting?reportDefinitionId=${encodeURIComponent(id)}`);if(r.ok)setExecutions((await r.json()).data??[]);};
  const loadSavedViews=async(id:string)=>{const r=await fetch(`/api/reporting?savedViewsFor=${encodeURIComponent(id)}`);if(r.ok)setSavedViews((await r.json()).data??[]);};
  const loadFinalized=async()=>{const r=await fetch("/api/reporting/finalized");if(r.ok)setFinalized((await r.json()).data??[]);};
  useEffect(()=>{
    let cancelled=false;
    void Promise.all([fetch("/api/reporting"),fetch("/api/reporting/finalized")]).then(async([definitionsResponse,finalizedResponse])=>{
      if(cancelled)return;
      if(definitionsResponse.ok){const data=(await definitionsResponse.json()).data??[];if(cancelled)return;setDefinitions(data);if(data[0])setSelected(data[0].id);}
      if(finalizedResponse.ok){const data=(await finalizedResponse.json()).data??[];if(!cancelled)setFinalized(data);}
    });
    return()=>{cancelled=true;};
  },[]);
  useEffect(()=>{
    if(!selected)return;
    let cancelled=false;
    void Promise.all([fetch(`/api/reporting?reportDefinitionId=${encodeURIComponent(selected)}`),fetch(`/api/reporting?savedViewsFor=${encodeURIComponent(selected)}`)]).then(async([executionResponse,viewResponse])=>{
      if(cancelled)return;
      if(executionResponse.ok){const data=(await executionResponse.json()).data??[];if(!cancelled)setExecutions(data);}
      if(viewResponse.ok){const data=(await viewResponse.json()).data??[];if(!cancelled)setSavedViews(data);}
    });
    return()=>{cancelled=true;};
  },[selected]);
  const chooseReport=(id:string)=>{setSelected(id);setStatus("");setSavedViewId("");setExecutions([]);setSavedViews([]);};
  const chooseSavedView=(id:string)=>{setSavedViewId(id);const view=savedViews.find(item=>item.id===id);setStatus(view?.parameters.status??"");};
  const execute=async()=>{if(!selected)return;setMessage("");const body=savedViewId?{operation:"execute",reportDefinitionId:selected,savedViewId}:{operation:"execute",reportDefinitionId:selected,parameters:status?{status}:{}};const r=await fetch("/api/reporting",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});setMessage(r.ok?"Report executed.":((await r.json()).error??"Execution failed"));if(r.ok)void loadExecutions(selected);};
  const saveView=async()=>{if(!selected||!savedViewName.trim())return;const r=await fetch("/api/reporting",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({operation:"save-view",reportDefinitionId:selected,name:savedViewName.trim(),parameters:status?{status}:{}})});setMessage(r.ok?"Saved personal report view.":((await r.json()).error??"Save failed"));if(r.ok){setSavedViewName("");void loadSavedViews(selected);}};
  const deleteView=async()=>{if(!savedViewId)return;const r=await fetch("/api/reporting",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({operation:"delete-view",savedViewId})});setMessage(r.ok?"Saved report view deleted.":((await r.json()).error??"Delete failed"));if(r.ok){setSavedViewId("");setStatus("");void loadSavedViews(selected);}};
  const finalize=async(reportExecutionId:string)=>{const r=await fetch("/api/reporting/finalized",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({operation:"finalize-execution",reportExecutionId})});setMessage(r.ok?"Report finalized.":((await r.json()).error??"Finalization failed"));if(r.ok)void loadFinalized();};
  const createDefinition=async()=>{if(!canManage||!newCode.trim()||!newName.trim())return;const r=await fetch("/api/reporting",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({operation:"create-definition",code:newCode.trim(),name:newName.trim(),description:newDescription.trim()||null,sourceKey:newSource})});setMessage(r.ok?"Governed report definition created.":((await r.json()).error??"Creation failed"));if(r.ok){setNewCode("");setNewName("");setNewDescription("");const data=await loadDefinitions();if(data[0]&&!selected)setSelected(data[0].id);}};

  return <section className="workspace-section" aria-labelledby="reporting-workspace-title">
    <div className="workspace-heading"><div><p className="eyebrow">Reporting & analytics</p><h2 id="reporting-workspace-title">Reporting & Analytics</h2><p>Run governed reports, apply approved filters, save personal views, review execution history, and access finalized report exports.</p></div></div>

    {canManage&&<form className="card admin-form equipment-admin-form" onSubmit={e=>{e.preventDefault();void createDefinition();}}><h3 className="equipment-form-span">Governed report definitions</h3><p className="equipment-form-span">Create definitions only from approved server-backed report sources.</p><label>Code<input value={newCode} onChange={e=>setNewCode(e.target.value)} /></label><label>Name<input value={newName} onChange={e=>setNewName(e.target.value)} /></label><label className="equipment-form-wide">Description<input value={newDescription} onChange={e=>setNewDescription(e.target.value)} /></label><label>Approved source<select value={newSource} onChange={e=>setNewSource(e.target.value as SourceKey)}>{(Object.keys(sourceLabels) as SourceKey[]).map(key=><option key={key} value={key}>{sourceLabels[key]}</option>)}</select></label><button type="submit" disabled={!newCode.trim()||!newName.trim()}>Create governed report</button></form>}

    <div className="card form-stack equipment-register-style"><h3>Run governed report</h3><div className="admin-form equipment-admin-form"><label>Report<select value={selected} onChange={e=>chooseReport(e.target.value)}><option value="">Select report</option>{definitions.map(d=><option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}</select></label><label>Status filter<select value={status} onChange={e=>{setStatus(e.target.value);setSavedViewId("");}} disabled={!selectedDefinition}><option value="">All approved statuses</option>{allowedStatuses.map(value=><option key={value} value={value}>{value}</option>)}</select></label><label>Personal saved view<select value={savedViewId} onChange={e=>chooseSavedView(e.target.value)} disabled={!selected}><option value="">Use current filter</option>{savedViews.map(view=><option key={view.id} value={view.id}>{view.name}</option>)}</select></label><button type="button" onClick={execute} disabled={!selected}>Run report</button></div><div className="admin-form equipment-admin-form"><label className="equipment-form-wide">Save current filter as<input value={savedViewName} onChange={e=>setSavedViewName(e.target.value)} disabled={!selected}/></label><button type="button" onClick={saveView} disabled={!selected||!savedViewName.trim()}>Save personal view</button><button type="button" onClick={deleteView} disabled={!savedViewId}>Delete selected view</button></div></div>

    {message&&<p role="status">{message}</p>}

    <section className="card form-stack equipment-register-style" aria-labelledby="reporting-execution-history"><h3 id="reporting-execution-history">Execution history</h3>{executions.length===0?<p>No executions.</p>:<ul>{executions.map(e=><li key={e.id}><strong>{e.reportCode}</strong> — {e.rowCount} rows — {new Date(e.executedAt).toLocaleString()} {canManage&&<button type="button" className="link-button" onClick={()=>finalize(e.id)}>Finalize</button>}</li>)}</ul>}</section>

    <section className="card form-stack equipment-register-style" aria-labelledby="reporting-finalized-reports"><h3 id="reporting-finalized-reports">Finalized reports</h3>{finalized.length===0?<p>No finalized reports.</p>:<ul>{finalized.map(f=><li key={f.id}><strong>{f.reportCode}</strong> — {f.rowCount} rows — {new Date(f.finalizedAt).toLocaleString()} {canExport&&<a href={`/api/reporting/finalized?finalizedReportId=${encodeURIComponent(f.id)}`}>Export CSV</a>}</li>)}</ul>}</section>
  </section>;
}
