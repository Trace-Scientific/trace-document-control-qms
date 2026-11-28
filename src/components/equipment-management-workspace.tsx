"use client";
import { useEffect,useMemo,useRef,useState } from "react";
import type { EquipmentEvidenceType } from "@/lib/equipment/workspace-selection";
import type { EquipmentStatus } from "@/lib/equipment/equipment";
import type { EquipmentWorklistItem } from "@/lib/equipment/worklist";
import { EquipmentRecallPanel } from "./equipment-recall-panel";
import { EquipmentRegister } from "./equipment-register";
import { GovernedEvidenceFilePicker } from "./governed-evidence-file-picker";

type Analytics={total:number;active:number;outOfService:number;retired:number;activeHolds:number;calibrationDue30:number;maintenanceDue30:number;serviceFailures90:number};
type HistoryEntry={id:string;kind:"EVENT"|"LIFECYCLE"|"SERVICE";occurredAt:string;label:string;summary:string;evidenceFileId:string|null};
const transitions:Record<EquipmentStatus,EquipmentStatus[]>={PLANNED:["ACTIVE","RETIRED"],ACTIVE:["OUT_OF_SERVICE","RETIRED"],OUT_OF_SERVICE:["ACTIVE","RETIRED"],RETIRED:[]};

export function EquipmentManagementWorkspace({ canManage, today, onReviewHolds, onRecordEvidence }: {
 canManage: boolean;
 today: string;
 onReviewHolds: (id: string, holdId?: string) => void;
 onRecordEvidence?: (id: string, type: EquipmentEvidenceType) => void;
}){
 const [analytics,setAnalytics]=useState<Analytics|null>(null),[equipment,setEquipment]=useState<EquipmentWorklistItem[]>([]),[error,setError]=useState("");
 const [selected,setSelected]=useState(""),[description,setDescription]=useState(""),[provider,setProvider]=useState(""),[outcome,setOutcome]=useState("COMPLETED"),[message,setMessage]=useState(""),[serviceEvidenceFileId,setServiceEvidenceFileId]=useState("");
 const [equipmentNumber,setEquipmentNumber]=useState(""),[name,setName]=useState(""),[manufacturer,setManufacturer]=useState(""),[model,setModel]=useState(""),[serialNumber,setSerialNumber]=useState(""),[receivedAt,setReceivedAt]=useState("");
 const [calibrationRequired,setCalibrationRequired]=useState(false),[calibrationIntervalDays,setCalibrationIntervalDays]=useState(""),[nextCalibrationDueAt,setNextCalibrationDueAt]=useState("");
 const [maintenanceRequired,setMaintenanceRequired]=useState(false),[maintenanceIntervalDays,setMaintenanceIntervalDays]=useState(""),[nextMaintenanceDueAt,setNextMaintenanceDueAt]=useState("");
 const [registrationMessage,setRegistrationMessage]=useState("");
 const [historyResult, setHistoryResult] = useState<{ id: string; entries: HistoryEntry[] | null } | null>(null);
 const [historyRevision, setHistoryRevision] = useState(0);
 const [qualificationSummary,setQualificationSummary]=useState(""),[qualificationFileId,setQualificationFileId]=useState(""),[operationsMessage,setOperationsMessage]=useState("");
 const [targetStatus,setTargetStatus]=useState<EquipmentStatus|"">(""),[lifecycleReason,setLifecycleReason]=useState("");
 const [registerLoaded, setRegisterLoaded] = useState(false);
 const selectedItem=useMemo(()=>equipment.find(x=>x.id===selected)??null,[equipment,selected]);

 async function refresh(){setError("");const r=await fetch("/api/equipment/operations",{cache:"no-store"});if(!r.ok){setError("Unable to load equipment operations");return;}const j=await r.json();setAnalytics(j.data.analytics);setEquipment(j.data.equipment);setRegisterLoaded(true);setSelected(current=>current&&j.data.equipment.some((x:EquipmentWorklistItem)=>x.id===current)?current:j.data.equipment[0]?.id||"");}
 const recallHeading = useRef<HTMLHeadingElement>(null);
 const [recallTarget, setRecallTarget] = useState<{ id: string } | null>(null);
 useEffect(() => {
   if (recallTarget?.id === selected) recallHeading.current?.focus();
 }, [recallTarget, selected]);
 function reviewRecalls(id: string) {
   selectEquipment(id);
   setRecallTarget({ id });
 }
 const history = historyResult?.id === selected ? historyResult : null;
 function selectEquipment(equipmentId: string) {
   if (equipmentId === selected) return;
   setSelected(equipmentId);
   setRecallTarget(null);
   setOperationsMessage("");
   setLifecycleReason("");
   setTargetStatus("");
   setQualificationSummary("");
   setQualificationFileId("");
   setDescription("");
   setProvider("");
   setOutcome("COMPLETED");
   setMessage("");
   setServiceEvidenceFileId("");
 }
 useEffect(() => {
   let cancelled = false;
   async function initialLoad() {
     try {
       const response = await fetch("/api/equipment/operations", { cache: "no-store" });
       if (!response.ok) throw new Error("Equipment register unavailable");
       const { data } = await response.json();
       if (cancelled) return;
       setAnalytics(data.analytics);
       setEquipment(data.equipment);
       setRegisterLoaded(true);
       setSelected(data.equipment[0]?.id ?? "");
     } catch {
       if (!cancelled) setError("Unable to load equipment operations");
     }
   }
   void initialLoad();
   return () => { cancelled = true; };
 }, []);
 useEffect(() => {
   if (!selected) return;
   const controller = new AbortController();
   fetch(`/api/equipment/${selected}/history`, { cache: "no-store", signal: controller.signal })
     .then(async response => {
       if (!response.ok) throw new Error("Equipment history unavailable");
       const { data }: { data: HistoryEntry[] } = await response.json();
       if (!controller.signal.aborted) setHistoryResult({ id: selected, entries: data });
     }).catch(() => {
       if (!controller.signal.aborted) setHistoryResult({ id: selected, entries: null });
     });
   return () => controller.abort();
 }, [selected, historyRevision]);
 useEffect(() => {
   function onEquipmentChanged(event: Event) {
     const equipmentId = (event as CustomEvent<{ equipmentId?: string }>).detail?.equipmentId;
     void refresh();
     if (equipmentId === selected) setHistoryRevision(revision => revision + 1);
   }
   window.addEventListener("qms:equipment-changed", onEquipmentChanged);
   return () => window.removeEventListener("qms:equipment-changed", onEquipmentChanged);
 }, [selected]);
 async function registerEquipment(e:React.FormEvent){e.preventDefault();setRegistrationMessage("");const payload={equipmentNumber,name,manufacturer:manufacturer||null,model:model||null,serialNumber:serialNumber||null,receivedAt:receivedAt||null,calibrationRequired,calibrationIntervalDays:calibrationRequired&&calibrationIntervalDays?Number(calibrationIntervalDays):null,nextCalibrationDueAt:calibrationRequired&&nextCalibrationDueAt?nextCalibrationDueAt:null,maintenanceRequired,maintenanceIntervalDays:maintenanceRequired&&maintenanceIntervalDays?Number(maintenanceIntervalDays):null,nextMaintenanceDueAt:maintenanceRequired&&nextMaintenanceDueAt?nextMaintenanceDueAt:null};const r=await fetch("/api/equipment",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const j=await r.json().catch(()=>null);setRegistrationMessage(r.ok?"Equipment registered with governed audit history.":j?.error??"Equipment registration failed");if(r.ok){setEquipmentNumber("");setName("");setManufacturer("");setModel("");setSerialNumber("");setReceivedAt("");setCalibrationRequired(false);setCalibrationIntervalDays("");setNextCalibrationDueAt("");setMaintenanceRequired(false);setMaintenanceIntervalDays("");setNextMaintenanceDueAt("");await refresh();}}
 async function recordQualification(e:React.FormEvent){e.preventDefault();if(!selected||!qualificationFileId)return;setOperationsMessage("");const r=await fetch(`/api/equipment/${selected}/events`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({eventType:"QUALIFIED",occurredAt:new Date().toISOString(),summary:qualificationSummary,evidenceFileId:qualificationFileId})});const j=await r.json().catch(()=>null);setOperationsMessage(r.ok?"Qualification evidence recorded and audited.":j?.error??"Qualification evidence could not be recorded");if(r.ok){setQualificationSummary("");setQualificationFileId("");setHistoryRevision(revision => revision + 1);await refresh();}}
 async function changeLifecycle(e:React.FormEvent){e.preventDefault();if(!selected||!targetStatus)return;setOperationsMessage("");const r=await fetch(`/api/equipment/${selected}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status:targetStatus,reason:lifecycleReason})});const j=await r.json().catch(()=>null);setOperationsMessage(r.ok?`Equipment lifecycle advanced to ${targetStatus}.`:j?.error??"Equipment lifecycle update failed");if(r.ok){setLifecycleReason("");setTargetStatus("");await refresh();setHistoryRevision(revision => revision + 1);}}
 async function recordService(e:React.FormEvent){e.preventDefault();if(!selected)return;setMessage("");const r=await fetch(`/api/equipment/${selected}/service`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({servicedAt:new Date().toISOString(),provider,description,outcome,evidenceFileId:serviceEvidenceFileId||null})});const j=await r.json();setMessage(r.ok?"Service record saved and audited.":j.error??"Service record failed");if(r.ok){setDescription("");setProvider("");setServiceEvidenceFileId("");await refresh();setHistoryRevision(revision => revision + 1);}}
 return <section className="workspace-section"><div className="workspace-heading"><div><p className="eyebrow">Laboratory operations</p><h2>Equipment management</h2><p>Governed usability, compliance holds, service history, and management indicators.</p></div></div>
 {error&&<p className="status-error">{error}</p>}
 {analytics&&<div className="stat-grid"><article><strong>{analytics.total}</strong><span>Total equipment</span></article><article><strong>{analytics.active}</strong><span>Active</span></article><article><strong>{analytics.activeHolds}</strong><span>Active compliance holds</span></article><article><strong>{analytics.calibrationDue30}</strong><span>Calibration due ≤30d</span></article><article><strong>{analytics.maintenanceDue30}</strong><span>Maintenance due ≤30d</span></article><article><strong>{analytics.serviceFailures90}</strong><span>Service failures / 90d</span></article></div>}
 {canManage&&<form className="card admin-form" onSubmit={registerEquipment}><h3 style={{gridColumn:"1 / -1"}}>Register equipment</h3><label>Equipment number<input required value={equipmentNumber} onChange={e=>setEquipmentNumber(e.target.value)} maxLength={80}/></label><label>Equipment name<input required value={name} onChange={e=>setName(e.target.value)} maxLength={240}/></label><label>Manufacturer<input value={manufacturer} onChange={e=>setManufacturer(e.target.value)} maxLength={240}/></label><label>Model<input value={model} onChange={e=>setModel(e.target.value)} maxLength={240}/></label><label>Serial number<input value={serialNumber} onChange={e=>setSerialNumber(e.target.value)} maxLength={240}/></label><label>Received date<input type="date" value={receivedAt} onChange={e=>setReceivedAt(e.target.value)}/></label><label><input type="checkbox" checked={calibrationRequired} onChange={e=>setCalibrationRequired(e.target.checked)}/> Calibration required</label>{calibrationRequired&&<><label>Calibration interval (days)<input required type="number" min={1} value={calibrationIntervalDays} onChange={e=>setCalibrationIntervalDays(e.target.value)}/></label><label>Next calibration due<input type="date" value={nextCalibrationDueAt} onChange={e=>setNextCalibrationDueAt(e.target.value)}/></label></>}<label><input type="checkbox" checked={maintenanceRequired} onChange={e=>setMaintenanceRequired(e.target.checked)}/> Maintenance required</label>{maintenanceRequired&&<><label>Maintenance interval (days)<input required type="number" min={1} value={maintenanceIntervalDays} onChange={e=>setMaintenanceIntervalDays(e.target.value)}/></label><label>Next maintenance due<input type="date" value={nextMaintenanceDueAt} onChange={e=>setNextMaintenanceDueAt(e.target.value)}/></label></>}<button type="submit">Register equipment</button>{registrationMessage&&<p style={{gridColumn:"1 / -1"}}>{registrationMessage}</p>}</form>}
 {registerLoaded && <EquipmentRegister equipment={equipment} today={today} selected={selected} onSelect={selectEquipment}
   onReviewHolds={onReviewHolds} onRecordEvidence={onRecordEvidence} onReviewRecalls={reviewRecalls} />}
 {!registerLoaded && !error && <p role="status">Loading equipment register…</p>}
 {selectedItem&&<div className="card form-stack equipment-register-style"><h3>Governed equipment operations — {selectedItem.equipmentNumber}</h3><p><strong>Status:</strong> {selectedItem.status} · <strong>Usability:</strong> {selectedItem.usable?"USABLE":"NOT USABLE"}</p>{operationsMessage&&<p role="status">{operationsMessage}</p>}{canManage&&selectedItem.status!=="RETIRED"&&<form className="admin-form equipment-admin-form" onSubmit={recordQualification}><h3 className="equipment-form-span">Record qualification evidence</h3><label className="equipment-form-wide">Qualification summary<textarea required maxLength={5000} value={qualificationSummary} onChange={e=>setQualificationSummary(e.target.value)}/></label><div className="equipment-form-span"><GovernedEvidenceFilePicker key={selected} domain="equipment" name="qualificationEvidenceFileId" onSelectionChange={setQualificationFileId}/></div><button type="submit" disabled={!qualificationSummary.trim()||!qualificationFileId}>Record qualification</button></form>}{canManage&&transitions[selectedItem.status].length>0&&<form className="admin-form equipment-admin-form" onSubmit={changeLifecycle}><h3 className="equipment-form-span">Equipment lifecycle</h3><label>Next status<select required value={targetStatus} onChange={e=>setTargetStatus(e.target.value as EquipmentStatus)}><option value="">Select governed transition</option>{transitions[selectedItem.status].map(status=><option key={status} value={status}>{status}</option>)}</select></label><label className="equipment-form-wide">Required reason<textarea required maxLength={1000} value={lifecycleReason} onChange={e=>setLifecycleReason(e.target.value)}/></label><button type="submit" disabled={!targetStatus||!lifecycleReason.trim()}>Apply lifecycle transition</button></form>}<h3>Operational history</h3>{!history ? <p role="status">Loading operational history…</p> : !history.entries ? <p role="alert">Unable to load operational history.</p> : history.entries.length?<ul>{history.entries.map(entry=><li key={`${entry.kind}:${entry.id}`}><strong>{entry.label}</strong> · {entry.occurredAt.slice(0,10)} — {entry.summary}{entry.evidenceFileId?" · supporting file attached":""}</li>)}</ul>:<p>No operational history recorded.</p>}</div>}
 {selectedItem && <EquipmentRecallPanel
   key={selectedItem.id}
   equipmentId={selectedItem.id}
   equipmentNumber={selectedItem.equipmentNumber}
   canManage={canManage}
   retired={selectedItem.status === "RETIRED"}
   activeHoldCount={selectedItem.activeHoldCount}
   headingRef={recallHeading}
   onChanged={() => window.dispatchEvent(new CustomEvent("qms:equipment-changed", { detail: { equipmentId: selectedItem.id } }))}
 />}
 {canManage&&<form className="card admin-form equipment-admin-form" onSubmit={recordService}><h3 className="equipment-form-span">Record service / repair evidence</h3><label>Equipment<select value={selected} onChange={e=>selectEquipment(e.target.value)} disabled={!equipment.length}>{equipment.length?<>{equipment.map(x=><option key={x.id} value={x.id}>{x.equipmentNumber} — {x.name}</option>)}</>:<option value="">Register equipment first</option>}</select></label><label>Provider<input value={provider} onChange={e=>setProvider(e.target.value)} maxLength={240}/></label><label>Outcome<select value={outcome} onChange={e=>setOutcome(e.target.value)}><option value="COMPLETED">Completed</option><option value="FAILED">Failed</option></select></label><label className="equipment-form-wide">Description<textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={5000} required/></label><div className="equipment-form-span"><GovernedEvidenceFilePicker key={selected} domain="equipment" name="serviceEvidenceFileId" onSelectionChange={setServiceEvidenceFileId}/></div><button type="submit" disabled={!selected}>Save audited service record</button>{message&&<p className="equipment-form-span">{message}</p>}</form>}
 </section>;
}
