"use client";

import { useEffect,useMemo,useState } from "react";

type EquipmentItem={
  id:string;
  equipmentNumber:string;
  name:string;
  status:"PLANNED"|"ACTIVE"|"OUT_OF_SERVICE"|"RETIRED";
  calibrationRequired:boolean;
  maintenanceRequired:boolean;
  nextCalibrationDueAt:string|null;
  nextMaintenanceDueAt:string|null;
};

const datePattern=/^\d{4}-\d{2}-\d{2}$/;
function normalizedDate(value:string|null|undefined){return value?.slice(0,10)??"";}
function validGovernedDate(value:string){
  if(!datePattern.test(value))return false;
  const year=Number(value.slice(0,4));
  if(year<1900||year>9999)return false;
  const parsed=new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}

export function EquipmentScheduleCorrectionWorkspace(){
  const [equipment,setEquipment]=useState<EquipmentItem[]>([]);
  const [selected,setSelected]=useState("");
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const selectedItem=useMemo(()=>equipment.find(item=>item.id===selected)??null,[equipment,selected]);

  async function loadEquipment(preferredId?:string){
    const response=await fetch("/api/equipment/operations",{cache:"no-store"});
    const body=await response.json().catch(()=>null);
    if(!response.ok){setError(body?.error??"Unable to load equipment");return;}
    const items:EquipmentItem[]=(body?.data?.equipment??[]).filter((item:EquipmentItem)=>item.status!=="RETIRED");
    setEquipment(items);
    const nextSelected=preferredId&&items.some(item=>item.id===preferredId)?preferredId:items[0]?.id??"";
    setSelected(nextSelected);
    setError("");
  }

  useEffect(()=>{let cancelled=false;async function initialLoad(){
    const response=await fetch("/api/equipment/operations",{cache:"no-store"});
    const body=await response.json().catch(()=>null);
    if(cancelled)return;
    if(!response.ok){setError(body?.error??"Unable to load equipment");return;}
    const items:EquipmentItem[]=(body?.data?.equipment??[]).filter((item:EquipmentItem)=>item.status!=="RETIRED");
    setEquipment(items);setSelected(items[0]?.id??"");
  }void initialLoad();return()=>{cancelled=true;};},[]);

  function changeEquipment(equipmentId:string){
    setSelected(equipmentId);setMessage("");
  }

  async function correctSchedule(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!selected||!selectedItem)return;
    const formData=new FormData(event.currentTarget);
    const nextCalibrationDueAt=String(formData.get("nextCalibrationDueAt")??"").trim();
    const nextMaintenanceDueAt=String(formData.get("nextMaintenanceDueAt")??"").trim();
    const reason=String(formData.get("reason")??"").trim();
    if(selectedItem.calibrationRequired&&!validGovernedDate(nextCalibrationDueAt)){setMessage("Enter the next calibration due date as YYYY-MM-DD using a year from 1900 through 9999.");return;}
    if(selectedItem.maintenanceRequired&&!validGovernedDate(nextMaintenanceDueAt)){setMessage("Enter the next maintenance due date as YYYY-MM-DD using a year from 1900 through 9999.");return;}
    if(!reason){setMessage("Enter the required correction reason before saving.");return;}
    setMessage("");
    const response=await fetch(`/api/equipment/${selected}`,{
      method:"PATCH",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({
        operation:"CORRECT_SCHEDULE",
        nextCalibrationDueAt:selectedItem.calibrationRequired?nextCalibrationDueAt||null:null,
        nextMaintenanceDueAt:selectedItem.maintenanceRequired?nextMaintenanceDueAt||null:null,
        reason,
      }),
    });
    const body=await response.json().catch(()=>null);
    setMessage(response.ok?"Equipment compliance schedule corrected with governed audit history.":body?.error??"Equipment schedule correction failed");
    if(response.ok){
      const changedEquipmentId=selected;
      event.currentTarget.reset();
      await loadEquipment(changedEquipmentId);
      window.dispatchEvent(new CustomEvent("qms:equipment-changed",{detail:{equipmentId:changedEquipmentId}}));
    }
  }

  const calibrationValue=normalizedDate(selectedItem?.nextCalibrationDueAt);
  const maintenanceValue=normalizedDate(selectedItem?.nextMaintenanceDueAt);
  const calibrationUsesPicker=!calibrationValue||validGovernedDate(calibrationValue);
  const maintenanceUsesPicker=!maintenanceValue||validGovernedDate(maintenanceValue);

  return <section className="card form-stack equipment-register-style">
    <h3>Correct compliance schedule</h3>
    <p>Correct an equipment calibration or maintenance due date when a documented data-entry error is identified. A required reason and before/after values are preserved in the audit trail and Operational history.</p>
    <form key={selected||"no-equipment"} className="admin-form equipment-admin-form" onSubmit={correctSchedule}>
      <label>Equipment<select required value={selected} onChange={event=>changeEquipment(event.target.value)} disabled={!equipment.length}>{equipment.length?equipment.map(item=><option key={item.id} value={item.id}>{item.equipmentNumber} — {item.name}</option>):<option value="">No equipment registered</option>}</select></label>
      {selectedItem&&<p className="equipment-form-span"><strong>Current calibration due:</strong> {calibrationValue||"—"} · <strong>Current maintenance due:</strong> {maintenanceValue||"—"}</p>}
      <label>Next calibration due<input name="nextCalibrationDueAt" type={calibrationUsesPicker?"date":"text"} inputMode={calibrationUsesPicker?undefined:"numeric"} placeholder={calibrationUsesPicker?undefined:"YYYY-MM-DD"} required={Boolean(selectedItem?.calibrationRequired)} disabled={!selectedItem?.calibrationRequired} defaultValue={calibrationValue} maxLength={calibrationUsesPicker?undefined:10} pattern={calibrationUsesPicker?undefined:"[0-9]{4}-[0-9]{2}-[0-9]{2}"} aria-describedby="equipment-calibration-date-help"/><span id="equipment-calibration-date-help" className="field-help">{calibrationUsesPicker?"Select or enter the corrected calibration due date.":"Legacy date detected. Enter the corrected date as YYYY-MM-DD."}</span></label>
      <label>Next maintenance due<input name="nextMaintenanceDueAt" type={maintenanceUsesPicker?"date":"text"} inputMode={maintenanceUsesPicker?undefined:"numeric"} placeholder={maintenanceUsesPicker?undefined:"YYYY-MM-DD"} required={Boolean(selectedItem?.maintenanceRequired)} disabled={!selectedItem?.maintenanceRequired} defaultValue={maintenanceValue} maxLength={maintenanceUsesPicker?undefined:10} pattern={maintenanceUsesPicker?undefined:"[0-9]{4}-[0-9]{2}-[0-9]{2}"} aria-describedby="equipment-maintenance-date-help"/><span id="equipment-maintenance-date-help" className="field-help">{maintenanceUsesPicker?"Select or enter the corrected maintenance due date; this does not record completed maintenance.":"Legacy date detected. Enter the corrected date as YYYY-MM-DD; this does not record completed maintenance."}</span></label>
      <label className="equipment-form-wide">Required correction reason<textarea name="reason" required rows={3} maxLength={1000}/></label>
      <p className="equipment-form-span" role="status">Enter the complete governed correction, then save. The server revalidates dates, permissions, reason, and audit requirements.</p>
      <button type="submit" disabled={!selected}>Save governed schedule correction</button>
      {message&&<p className="equipment-form-span" role="status">{message}</p>}
      {error&&<p className="status-error equipment-form-span">{error}</p>}
    </form>
  </section>;
}
