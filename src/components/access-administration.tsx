"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AuditHistory } from "./audit-history";
import { MembershipAdministration } from "./membership-administration";
import { NotificationDeliveryAdministration } from "./notification-delivery-administration";
import { WorkflowTemplateAdministration } from "./workflow-template-administration";

type AdminSection = "overview" | "organization" | "access" | "memberships" | "documents" | "workflows" | "notifications" | "audit";
type RoleAssignment = { userId: string; roleId: string; scopeType: "ORGANIZATION" | "SITE" | "DEPARTMENT"; scopeId: string | null; assignedAt: string; assignedBy: string | null };
type AdminData = { organization: { displayName: string; loginCode: string }; sites: Array<{ id: string; name: string }>; departments: Array<{ id: string; name: string; siteId: string | null }>; users: Array<{ id: string; email: string; firstName: string; lastName: string; status: string }>; roles: Array<{ id: string; name: string; permissions: Array<{ permission: { key: string } }> }>; permissions: Array<{ key: string; description: string | null }>; documentTypes: Array<{ id: string; code: string; name: string; reviewMonths: number | null; active: boolean }>; roleAssignments: RoleAssignment[] };

function permissionDescription(permission: { key: string; description: string | null }) {
  if (permission.description) return permission.description;
  const known: Record<string, string> = {
    "document.read": "View controlled documents and their version history.",
    "document.create": "Create and edit draft controlled documents.",
    "document.revise": "Create a successor revision from an existing controlled version.",
    "document.submit": "Submit a draft into controlled review.",
    "document.review": "Participate in controlled document review.",
    "document.review.complete": "Complete an assigned controlled-document review stage.",
    "document.review.manage": "Manage controlled-document review assignments and workflow progression.",
    "document.approve": "Approve a controlled document using the approved signature workflow.",
    "document.make_effective": "Make an approved version effective.",
    "document.retire": "Retire a controlled document version.",
    "document.distribute": "Create governed acknowledgment distributions.",
    "document.acknowledge": "Complete assigned read-and-understand acknowledgments.",
    "document.export": "Export an exact controlled document version with audit evidence.",
    "document.delete": "Archive eligible unlinked file objects; controlled history is not deleted.",
    "administration.manage": "Manage organization configuration, users, roles, sites, and departments.",
    "audit.read": "View append-only audit history.",
    "notification.manage": "Manage notification delivery diagnostics and operations.",
  };
  return known[permission.key] ?? permission.key;
}

const demoRolePresets: Record<string, string[]> = {
  "Document Reviewer": ["document.read", "document.review", "document.review.complete"],
  "Document Approver": ["document.read", "document.approve"],
  "Laboratory Technician": ["document.read", "document.acknowledge"],
};

function scopePayload(value: string) {
  if (value === "ORGANIZATION") return { scopeType: "ORGANIZATION", scopeId: null };
  const [scopeType, scopeId] = value.split(":", 2);
  return { scopeType, scopeId };
}

export function AccessAdministration() {
  const [roleName, setRoleName] = useState(""), [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [showTemporaryPassword, setShowTemporaryPassword] = useState(false), [passwordMismatch, setPasswordMismatch] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<string | null>(null), [actionFeedback, setActionFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [data, setData] = useState<AdminData | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState(""), [section, setSection] = useState<AdminSection>("overview"), [platformAccess, setPlatformAccess] = useState(false);
  async function load() { const response = await fetch("/api/admin"); const body = await response.json().catch(() => null); if (response.ok) setData(body.data); else setError(body?.error ?? "Administration could not be loaded."); }
  useEffect(() => { let active = true; fetch("/api/admin").then(async (response) => ({ response, body: await response.json().catch(() => null) })).then(({ response, body }) => { if (!active) return; if (response.ok) setData(body.data); else setError(body?.error ?? "Administration could not be loaded."); }); return () => { active = false; }; }, []);
  useEffect(() => { let active = true; fetch("/api/platform/me", { cache: "no-store" }).then((response) => { if (active) setPlatformAccess(response.ok); }).catch(() => { if (active) setPlatformAccess(false); }); return () => { active = false; }; }, []);
  async function command(payload: Record<string, unknown>) {
    const operation = String(payload.operation ?? "Change");
    setPendingOperation(operation);
    setActionFeedback(null);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/commands", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const details = Array.isArray(body?.details) ? body.details.map((item: { field?: string; message?: string }) => `${item.field || "Request"}: ${item.message || "Invalid value"}`).join("; ") : "";
        const message = [body?.error ?? "Change could not be completed.", details].filter(Boolean).join(" — ");
        setError(message);
        setActionFeedback({ kind: "error", message });
        return;
      }
      const label = operation.replaceAll("_", " ").toLowerCase();
      const message = `Successfully completed: ${label}. The change was audited.`;
      setNotice(message);
      setActionFeedback({ kind: "success", message });
      try { await load(); } catch { setActionFeedback({ kind: "error", message: `The ${label} request succeeded, but the administration list could not refresh. Reload to verify.` }); }
    } catch {
      const message = "Unable to confirm the result due to a connection error. Refresh the list before trying again to avoid duplicates.";
      setError(message);
      setActionFeedback({ kind: "error", message });
    } finally {
      setPendingOperation(null);
    }
  }
  function form(operation: string, fields: (form: FormData) => Record<string, unknown>) {
    return (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (pendingOperation) return;
      const formData = new FormData(event.currentTarget);
      void command({ operation, ...fields(formData) });
    };
  }
  if (!data) return <section className="panel documents-panel"><p>{error || "Loading access administration…"}</p></section>;

  const sections: Array<{ id: AdminSection; label: string; description: string }> = [
    { id: "overview", label: "Overview", description: "Choose an administration workspace." },
    { id: "organization", label: "Organization", description: "Sites and departments." },
    { id: "access", label: "Users & access", description: "Users, roles, permissions, and assignments." },
    { id: "memberships", label: "Memberships", description: "Authoritative site and department memberships." },
    { id: "documents", label: "Document configuration", description: "Document types and review intervals." },
    { id: "workflows", label: "Workflow templates", description: "Immutable, versioned review-stage definitions." },
    { id: "notifications", label: "Notifications", description: "Delivery monitoring and governed recovery actions." },
    { id: "audit", label: "Audit trail", description: "Append-only administration history." },
  ];

  const roleById = new Map(data.roles.map((role) => [role.id, role]));
  const userById = new Map(data.users.map((user) => [user.id, user]));
  const sites = data.sites;
  const departments = data.departments;
  function scopeLabel(assignment: RoleAssignment) {
    if (assignment.scopeType === "ORGANIZATION") return "Entire organization";
    if (assignment.scopeType === "SITE") return `Site · ${sites.find((site) => site.id === assignment.scopeId)?.name ?? "Unknown site"}`;
    return `Department · ${departments.find((department) => department.id === assignment.scopeId)?.name ?? "Unknown department"}`;
  }

  return <>
    <section className="panel documents-panel admin-hub">
      <div className="panel-header"><div><h2>Administration</h2><p>{data.organization.displayName} · {data.organization.loginCode}</p></div></div>
      {error && <div className="detail-error" role="alert">{error}</div>}{notice && <div className="detail-notice">{notice}</div>}
      {(pendingOperation || actionFeedback) && <div role={actionFeedback?.kind === "error" ? "alert" : "status"} aria-live="polite" style={{ position: "fixed", right: 20, bottom: 20, zIndex: 1000, maxWidth: 420, padding: "14px 18px", borderRadius: 10, border: "1px solid #cbd5e1", boxShadow: "0 8px 24px #0002", background: actionFeedback?.kind === "error" ? "#fff1f2" : "#eff6ff", color: "#172554" }}>
        <strong>{pendingOperation ? "Processing…" : actionFeedback?.kind === "error" ? "Action needs attention" : "Action completed"}</strong>
        <p style={{ margin: "6px 0 0" }}>{pendingOperation ? "Please wait. Do not submit again." : actionFeedback?.message}</p>
        {!pendingOperation && <button type="button" className="secondary-button" onClick={() => setActionFeedback(null)} style={{ marginTop: 8 }}>Dismiss</button>}
      </div>}
      <nav className="section-nav" aria-label="Administration sections">{sections.map((item) => <button type="button" key={item.id} className={section === item.id ? "active" : ""} aria-current={section === item.id ? "page" : undefined} onClick={() => setSection(item.id)}>{item.label}</button>)}</nav>

      {section === "overview" && <div className="admin-overview-grid">{sections.filter((item) => item.id !== "overview").map((item) => <button type="button" className="admin-overview-card" key={item.id} onClick={() => setSection(item.id)}><strong>{item.label}</strong><span>{item.description}</span></button>)}{platformAccess ? <a className="admin-overview-card" href="/platform"><strong>Platform Administration</strong><span>Open the separate Trace control plane for Help &amp; User Manual and other platform-governed functions.</span></a> : null}</div>}

      {section === "organization" && <div className="admin-section-stack"><div className="section-heading"><h3>Organization</h3><p>Maintain the controlled site and department structure.</p></div><div className="template-layout">
        <form className="template-form" onSubmit={form("CREATE_SITE", (f) => ({ name: String(f.get("name")) }))}><strong>Add site</strong><label>Name<input name="name" required /></label><button type="submit" className="primary-button" disabled={pendingOperation !== null}>Create site</button></form>
        <form className="template-form" onSubmit={form("CREATE_DEPARTMENT", (f) => ({ name: String(f.get("name")), siteId: String(f.get("siteId")) || null }))}><strong>Add department</strong><label>Name<input name="name" required /></label><label>Site<select name="siteId"><option value="">Organization-wide</option>{data.sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select></label><button type="submit" className="primary-button" disabled={pendingOperation !== null}>Create department</button></form>
      </div></div>}

      {section === "access" && <div className="admin-section-stack"><div className="section-heading"><h3>Users &amp; access</h3><p>Create accounts, define least-privilege roles, and assign scoped access.</p></div><div className="template-layout">
        <form className="template-form" onSubmit={(event) => {
          event.preventDefault();
          const element = event.currentTarget;
          const fields = new FormData(element);
          const password = String(fields.get("temporaryPassword") ?? "");
          const confirmation = String(fields.get("confirmTemporaryPassword") ?? "");
          if (password !== confirmation) { setPasswordMismatch(true); return; }
          setPasswordMismatch(false);
          void command({ operation: "CREATE_USER", email: String(fields.get("email")), firstName: String(fields.get("firstName")), lastName: String(fields.get("lastName")), temporaryPassword: password });
          element.reset();
          setShowTemporaryPassword(false);
        }}>
          <strong>Add user</strong>
          <label>First name<input name="firstName" required /></label>
          <label>Last name<input name="lastName" required /></label>
          <label>Email<input name="email" type="email" required /></label>
          <label>Temporary password
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input name="temporaryPassword" type={showTemporaryPassword ? "text" : "password"} minLength={12} required autoComplete="new-password" onChange={() => setPasswordMismatch(false)} style={{ flex: 1, minWidth: 0 }} />
              <button type="button" className="secondary-button" aria-label={showTemporaryPassword ? "Hide passwords" : "Show passwords"} aria-pressed={showTemporaryPassword} onClick={() => setShowTemporaryPassword((value) => !value)}>{showTemporaryPassword ? "Hide" : "Show"}</button>
            </span>
          </label>
          <label>Confirm temporary password
            <input name="confirmTemporaryPassword" type={showTemporaryPassword ? "text" : "password"} minLength={12} required autoComplete="new-password" aria-invalid={passwordMismatch} aria-describedby={passwordMismatch ? "temporary-password-error" : undefined} onChange={() => setPasswordMismatch(false)} />
          </label>
          {passwordMismatch && <p id="temporary-password-error" className="detail-error" role="alert">Passwords do not match. Please enter the same password in both fields.</p>}
          <button type="submit" className="primary-button" disabled={pendingOperation !== null}>Create user</button>
        </form>
        <form className="template-form" onSubmit={form("CREATE_ROLE", (f) => ({ name: String(f.get("name")), permissionKeys: f.getAll("permissionKeys").map(String) }))}>
          <strong>Add role</strong>
          <label>Demo role preset (optional)
            <select defaultValue="" onChange={(event) => {
              const name = event.currentTarget.value;
              if (!name) return;
              setRoleName(name);
              setRolePermissions(demoRolePresets[name].filter((key) => data.permissions.some((permission) => permission.key === key)));
            }}>
              <option value="">Select a preset or configure manually</option>
              {Object.keys(demoRolePresets).map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <p>Presets only fill this form. Review the selected permissions and click Create role to save. Existing roles are not modified.</p>
          <label>Name<input name="name" value={roleName} onChange={(event) => setRoleName(event.target.value)} required /></label>
          <fieldset style={{ minWidth: 0 }}><legend>Permissions</legend>
            <p style={{ margin: "0 0 12px" }}>Select only the permissions this role needs. Click anywhere on a row to select it.</p>
            {Array.from(new Set(data.permissions.map((permission) => permission.key.split(".")[0]))).map((category) => (
              <div key={category} style={{ marginBottom: 16 }}>
                <h4 style={{ margin: "12px 0 8px", textTransform: "capitalize" }}>{category.replaceAll("_", " ")}</h4>
                <div style={{ border: "1px solid #dbe2ea", borderRadius: 8, overflow: "hidden" }}>
                  {data.permissions.filter((permission) => permission.key.split(".")[0] === category).map((permission, index) => (
                    <label key={permission.key} style={{ display: "grid", gridTemplateColumns: "22px minmax(0, 1fr)", alignItems: "center", gap: 12, padding: "12px 14px", background: index % 2 ? "#f1f4f8" : "#fff", cursor: "pointer", borderBottom: "1px solid #e3e8ee", margin: 0 }}>
                      <input type="checkbox" name="permissionKeys" value={permission.key} checked={rolePermissions.includes(permission.key)} onChange={(event) => setRolePermissions((current) => event.target.checked ? [...current, permission.key] : current.filter((key) => key !== permission.key))} style={{ margin: 0, width: 16, height: 16, justifySelf: "center" }} />
                      <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                        <strong style={{ overflowWrap: "anywhere" }}>{permission.key}</strong>
                        <small style={{ overflowWrap: "anywhere" }}>{permissionDescription(permission)}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </fieldset><button type="submit" className="primary-button" disabled={pendingOperation !== null}>Create role</button>
        </form>
        <form className="template-form" onSubmit={form("ASSIGN_ROLE", (f) => ({ userId: String(f.get("userId")), roleId: String(f.get("roleId")), ...scopePayload(String(f.get("scopeTarget"))) }))}><strong>Assign role</strong><p>Choose the smallest scope required. Reassigning the same role updates its scope.</p><label>User<select name="userId" required>{data.users.map((user) => <option value={user.id} key={user.id}>{user.firstName} {user.lastName} · {user.email}</option>)}</select></label><label>Role<select name="roleId" required>{data.roles.map((role) => <option value={role.id} key={role.id}>{role.name}</option>)}</select></label><label>Scope<select name="scopeTarget" required><option value="ORGANIZATION">Entire organization</option>{data.sites.map((site) => <option value={`SITE:${site.id}`} key={`site-${site.id}`}>Site · {site.name}</option>)}{data.departments.map((department) => <option value={`DEPARTMENT:${department.id}`} key={`department-${department.id}`}>Department · {department.name}</option>)}</select></label><button type="submit" className="primary-button" disabled={pendingOperation !== null}>Assign scoped role</button></form>
      </div><div className="detail-section"><h3>Existing role assignments &amp; effective access</h3><p>Review current scoped assignments before making access changes. Effective permissions are the union of assigned roles within their applicable scopes.</p>{data.users.map((user) => { const assignments = data.roleAssignments.filter((assignment) => assignment.userId === user.id); const effectivePermissions = [...new Set(assignments.flatMap((assignment) => roleById.get(assignment.roleId)?.permissions.map((item) => item.permission.key) ?? []))].sort(); return <div className="template-form" key={`access-${user.id}`}><strong>{user.firstName} {user.lastName} · {user.email}</strong><p>Status: {user.status}</p>{assignments.length === 0 ? <p>No role assignments.</p> : <div className="table-scroll"><table><thead><tr><th>Role</th><th>Scope</th><th>Assigned</th><th>Assigned by</th></tr></thead><tbody>{assignments.map((assignment) => { const assigner = assignment.assignedBy ? userById.get(assignment.assignedBy) : null; return <tr key={`${assignment.userId}-${assignment.roleId}`}><td>{roleById.get(assignment.roleId)?.name ?? "Unknown role"}</td><td>{scopeLabel(assignment)}</td><td>{new Date(assignment.assignedAt).toLocaleString()}</td><td>{assigner ? `${assigner.firstName} ${assigner.lastName}` : "System / historical"}</td></tr>; })}</tbody></table></div>}<details><summary>Effective permissions ({effectivePermissions.length})</summary>{effectivePermissions.length === 0 ? <p>No permissions granted.</p> : <p>{effectivePermissions.join(", ")}</p>}</details></div>; })}</div></div>}

      {section === "memberships" && <MembershipAdministration embedded />}

      {section === "documents" && <div className="admin-section-stack"><div className="section-heading"><h3>Document configuration</h3><p>Manage governed document types and their review intervals.</p></div><div className="template-layout">
        <form className="template-form" onSubmit={form("CREATE_DOCUMENT_TYPE", (f) => ({ code: String(f.get("code")), name: String(f.get("name")), reviewMonths: String(f.get("reviewMonths") || "").trim() ? Number(f.get("reviewMonths")) : null }))}><strong>Add document type</strong><label>Code<input name="code" required maxLength={30} placeholder="SOP" /></label><label>Name<input name="name" required maxLength={120} placeholder="Procedure" /></label><label>Review interval (months)<input name="reviewMonths" type="number" min={1} max={120} /></label><button type="submit" className="primary-button" disabled={pendingOperation !== null}>Create document type</button></form>
      </div><div className="detail-section"><h3>Document types</h3>{data.documentTypes.length === 0 ? <p>No document types configured. Create one above before starting a controlled document.</p> : <div className="template-layout">{data.documentTypes.map((type) => <div className="template-form" key={type.id}><strong>{type.code} · {type.name}</strong><p>{type.reviewMonths ? `Review every ${type.reviewMonths} months` : "No default review interval"} · {type.active ? "Active" : "Inactive"}</p><form onSubmit={form("UPDATE_DOCUMENT_TYPE_REVIEW_INTERVAL", (f) => ({ documentTypeId: type.id, reviewMonths: Number(f.get("reviewMonths")) }))}><label>Review interval (months)<input name="reviewMonths" type="number" min={1} max={120} defaultValue={type.reviewMonths ?? ""} required /></label><button className="secondary-button">Save review interval</button></form><button type="button" className="secondary-button" onClick={() => command({ operation: "SET_DOCUMENT_TYPE_ACTIVE", documentTypeId: type.id, active: !type.active })}>{type.active ? "Deactivate" : "Activate"}</button></div>)}</div>}</div></div>}

      {section === "workflows" && <WorkflowTemplateAdministration />}
      {section === "notifications" && <NotificationDeliveryAdministration />}
    </section>
    {section === "audit" && <AuditHistory />}
  </>;
}
