"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./platform-administration-shell.module.css";

type Principal={identityId:string;membershipId:string;email:string;identityStatus:string;membershipStatus:string};
type Role={id:string;name:string;description:string|null;systemRole:boolean};
type Permission={id:string;key:string;description:string|null};
type RolePermission={roleId:string;permissionId:string;permissionKey:string};
type Assignment={membershipId:string;roleId:string;assignedAt:string;assignedByMembershipId:string|null};

export function PlatformSecurityPanel(){
  const [principals,setPrincipals]=useState<Principal[]>([]);
  const [roles,setRoles]=useState<Role[]>([]);
  const [permissions,setPermissions]=useState<Permission[]>([]);
  const [rolePermissions,setRolePermissions]=useState<RolePermission[]>([]);
  const [assignments,setAssignments]=useState<Assignment[]>([]);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);

  async function load(){
    const r=await fetch("/api/platform/security/workspace",{cache:"no-store"});
    const p=await r.json().catch(()=>null);
    if(!r.ok) throw new Error(p?.error||"Platform security workspace could not be loaded.");
    setPrincipals(p.data.principals);setRoles(p.data.roles);setPermissions(p.data.permissions);
    setRolePermissions(p.data.rolePermissions);setAssignments(p.data.assignments);
  }
  useEffect(()=>{void Promise.resolve().then(()=>load()).catch(e=>setError(e instanceof Error?e.message:"Platform security workspace could not be loaded."));},[]);

  const customRoles=useMemo(()=>roles.filter(r=>!r.systemRole),[roles]);

  async function createRole(){
    const name=window.prompt("Custom platform role name"); if(!name?.trim()) return;
    const description=window.prompt("Role description (optional)","");
    const keys=window.prompt("Permission keys, comma-separated",permissions.slice(0,3).map(p=>p.key).join(","));
    if(keys===null) return;
    const permissionKeys=keys.split(",").map(x=>x.trim()).filter(Boolean);
    const invalid=permissionKeys.filter(k=>!permissions.some(p=>p.key===k));
    if(invalid.length){setError("Unknown permission key(s): "+invalid.join(", "));return;}
    const reason=window.prompt("Reason for creating custom platform role"); if(!reason?.trim()) return;
    await post("/api/platform/security/roles",{name,description:description?.trim()||null,permissionKeys,reason},"Custom platform role created.");
  }

  async function editPermissions(role:Role){
    if(role.systemRole){setError("System platform roles are bootstrap-controlled and read-only.");return;}
    const current=rolePermissions.filter(x=>x.roleId===role.id).map(x=>x.permissionKey);
    const keys=window.prompt("Permission keys, comma-separated",current.join(","));
    if(keys===null) return;
    const permissionKeys=keys.split(",").map(x=>x.trim()).filter(Boolean);
    const invalid=permissionKeys.filter(k=>!permissions.some(p=>p.key===k));
    if(invalid.length){setError("Unknown permission key(s): "+invalid.join(", "));return;}
    const reason=window.prompt("Reason for changing role permissions"); if(!reason?.trim()) return;
    setBusy(true);setError(null);setNotice(null);
    try{
      const r=await fetch("/api/platform/security/roles/"+encodeURIComponent(role.id)+"/permissions",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({permissionKeys,reason})});
      const p=await r.json().catch(()=>null);if(!r.ok) throw new Error(p?.error||"Role permissions could not be updated.");
      setNotice("Custom role permissions updated with platform audit evidence.");await load();
    }catch(e){setError(e instanceof Error?e.message:"Role permissions could not be updated.");}
    finally{setBusy(false);}
  }

  async function assignRole(){
    const activePrincipals=principals.filter(p=>p.identityStatus==="ACTIVE"&&p.membershipStatus==="ACTIVE");
    if(!activePrincipals.length||!customRoles.length){setError("An active platform membership and at least one custom role are required.");return;}
    const membershipId=window.prompt("Platform membership ID",activePrincipals[0].membershipId); if(!membershipId) return;
    const roleId=window.prompt("Custom role ID",customRoles[0].id); if(!roleId) return;
    const reason=window.prompt("Reason for assigning custom role"); if(!reason?.trim()) return;
    await post("/api/platform/security/assignments",{membershipId,roleId,reason},"Custom platform role assigned.");
  }

  async function unassign(item:Assignment){
    const role=roles.find(r=>r.id===item.roleId);
    if(role?.systemRole){setError("System platform role assignments are bootstrap-controlled and read-only.");return;}
    const reason=window.prompt("Reason for removing custom role assignment"); if(!reason?.trim()) return;
    await post("/api/platform/security/assignments/unassign",{membershipId:item.membershipId,roleId:item.roleId,reason},"Custom platform role assignment removed.");
  }

  async function post(url:string,body:Record<string,unknown>,success:string){
    setBusy(true);setError(null);setNotice(null);
    try{
      const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
      const p=await r.json().catch(()=>null);if(!r.ok) throw new Error(p?.error||"Platform security action failed.");
      setNotice(success);await load();
    }catch(e){setError(e instanceof Error?e.message:"Platform security action failed.");}
    finally{setBusy(false);}
  }

  return <div className={styles.grid}>
    <article className={styles.card}>
      <h3>Platform principals</h3>
      <p>Platform identities and memberships are distinct from tenant users, roles, and permissions.</p>
      {principals.length===0?<p>No platform principals configured.</p>:principals.map(p=><div key={p.membershipId}>
        <strong>{p.email}</strong>
        <p>Identity {p.identityStatus} · Membership {p.membershipStatus}</p>
        <p>{assignments.filter(a=>a.membershipId===p.membershipId).map(a=>roles.find(r=>r.id===a.roleId)?.name??a.roleId).join(" · ")||"No platform role assigned"}</p>
      </div>)}
    </article>

    <article className={styles.card}>
      <h3>Platform roles & permissions</h3>
      <p>System roles are bootstrap-controlled and read-only here. Use custom roles for least-privilege delegation.</p>
      <button type="button" disabled={busy} onClick={()=>void createRole()}>Create custom role</button>
      {roles.map(role=><div key={role.id}>
        <strong>{role.name}{role.systemRole?" · SYSTEM":""}</strong>
        <p>{role.description||"No description"}</p>
        <p>{rolePermissions.filter(x=>x.roleId===role.id).map(x=>x.permissionKey).join(" · ")||"No permissions"}</p>
        {!role.systemRole?<button type="button" disabled={busy} onClick={()=>void editPermissions(role)}>Edit permissions</button>:null}
      </div>)}
    </article>

    <article className={styles.card}>
      <h3>Role assignments</h3>
      <p>Assignments affect only Trace platform authority. They do not grant tenant QMS permissions.</p>
      <button type="button" disabled={busy} onClick={()=>void assignRole()}>Assign custom role</button>
      {assignments.map(item=>{
        const principal=principals.find(p=>p.membershipId===item.membershipId);
        const role=roles.find(r=>r.id===item.roleId);
        return <div key={item.membershipId+":"+item.roleId}>
          <strong>{principal?.email??item.membershipId} · {role?.name??item.roleId}</strong>
          <p>Assigned {new Date(item.assignedAt).toLocaleString()}</p>
          {role&&!role.systemRole?<button type="button" disabled={busy} onClick={()=>void unassign(item)}>Remove custom role</button>:null}
        </div>;
      })}
    </article>

    {error?<div className={styles.error} role="alert">{error}</div>:null}
    {notice?<div className={styles.notice} role="status">{notice}</div>:null}
  </div>;
}
