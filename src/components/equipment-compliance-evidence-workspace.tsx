"use client";

import { useEffect,useMemo,useState } from "react";
import { GovernedEvidenceFilePicker } from "./governed-evidence-file-picker";

type EquipmentItem={
  id:string;
  equipmentNumber:string;
  name:string;
  status:"PLANNED"|"ACTIVE"|"OUT_OF_SERVICE"|"RETIRED";
  nextCalibrationDueAt:string|null;
  nextMaintenanceDueAt:string|null;
};
type EventType="CALIBRATED"|"MAINTENANCE";

export function EquipmentComplianceEvidenceWorkspace({today}:{today:string}){
  const [equipment,setEquipment]=useState<EquipmentItem[]>([]);
  const [selected,setSelected]=useState("");
  const [eventType,setEventType]=useState<EventType>("CALIBRATED");
  const [eventDate,setEventDate]=useState(today);
  const [summary,setSummary]=useState("");
  const [evidenceFileId,setEvidenceFileId]=useState("");
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const selectedItem=useMemo(()=>equipment.find(item=>item.id===selected)??null,[equipment,selected]);

  async function loadEquipment(){
    const response=await fetch("/api/equipment/operations",{cache:"no-store"});
    const body=await response.json().catch(()=>null);
    if(!response.ok){setError(body?.error??"Unable to load equipment");return;}
    const activeItems=(body?.data?.equipment??[]).filter((item:EquipmentItem)=>item.status!=="RETIRED");
    setEquipment(activeItems);
    setSelected(current=>current&&activeItems.some((item:EquipmentItem)=>item.id===current)?current:activeItems[0]?.id??"");
  }

  useEffect(()=>{let cancelled=false;async function initialLoad(){
    const response=await fetch("/api/equipment/operations",{cache:"no-store"});
    const body=await response.json().catch(()=>null);
    if(cancelled)return;
    if(!response.ok){setError(body?.error??"Unable to load equipment");return;}
    const activeItems=(body?.data?.equipment??[]).filter((item:EquipmentItem)=>item.status!=="RETIRED");
    setEquipment(activeItems);setSelected(activeItems[0]?.id??"");
  }void initialLoad();return()=>{cancelled=true;};},[]);

  async function recordEvidence(event:React.FormEvent){
    event.preventDefault();
    if(!selected||!evidenceFileId)return;
    setMessage("");
    const occurredAt=new Date(`${eventDate}T12:00:00.000Z`).toISOString();
    const response=await fetch(`/api/equipment/${selected}/events`,{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({eventType,occurredAt,summary,evidenceFileId}),
    });
    const body=await response.json().catch(()=>null);
    const label=eventType==="CALIBRATED"?"Calibration":"Maintenance";
    setMessage(response.ok?`${label} evidence recorded and next due date advanced from the governed interval.`:body?.error??`${label} evidence could not be recorded`);
    if(response.ok){
      const changedEquipmentId=selected;
      setSummary("");
      setEvidenceFileId("");
      await loadEquipment();
      window.dispatchEvent(new CustomEvent("qms:equipment-changed",{detail:{equipmentId:changedEquipmentId}}));
    }
  }

  return <section className="card form-stack equipment-register-style">
    <h3>Calibration & maintenance evidence</h3>
    <p>Record completed calibration or preventive maintenance with governed supporting evidence. The next due date is calculated from the recorded event date and the equipment&apos;s configured interval.</p>
    <form className="admin-form equipment-admin-form" onSubmit={recordEvidence}>
      <label>Equipment<select required value={selected} onChange={event=>{setSelected(event.target.value);setMessage("");setEvidenceFileId("");}} disabled={!equipment.length}>{equipment.length?equipment.map(item=><option key={item.id} value={item.id}>{item.equipmentNumber} — {item.name}</option>):<option value="">Register equipment first</option>}</select></label>
      {selectedItem&&<p className="equipment-form-span"><strong>Current calibration due:</strong> {selectedItem.nextCalibrationDueAt?.slice(0,10)??"—"} · <strong>Current maintenance due:</strong> {selectedItem.nextMaintenanceDueAt?.slice(0,10)??"—"}</p>}
      <label className="equipment-schedule-date-field">Completed date<input required type="date" value={eventDate} onChange={event=>setEventDate(event.target.value)} aria-describedby="equipment-completed-date-help"/><span id="equipment-completed-date-help" className="field-help">Select or enter the completed calibration or maintenance date.</span></label>
      <label className="equipment-schedule-date-field">Evidence type<select value={eventType} onChange={event=>{setEventType(event.target.value as EventType);setMessage("");setEvidenceFileId("");}}><option value="CALIBRATED">Calibration completed</option><option value="MAINTENANCE">Preventive maintenance completed</option></select><span className="field-help" aria-hidden="true">&nbsp;</span></label>
      <label className="equipment-form-wide">Evidence summary<textarea required rows={3} maxLength={5000} value={summary} onChange={event=>setSummary(event.target.value)}/></label>
      <div className="equipment-form-span"><GovernedEvidenceFilePicker key={`${selected}:${eventType}`} domain="equipment" name="equipmentComplianceEvidenceFileId" onSelectionChange={setEvidenceFileId}/></div>
      <button type="submit" disabled={!selected||!eventDate||!summary.trim()||!evidenceFileId}>Record governed evidence</button>
      {message&&<p className="equipment-form-span" role="status">{message}</p>}
      {error&&<p className="status-error equipment-form-span">{error}</p>}
    </form>
  </section>;
}
