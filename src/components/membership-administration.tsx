"use client";

import { useEffect, useState, type FormEvent } from "react";

type UserOption = { id: string; name: string; status: string; siteIds: string[]; departmentIds: string[] };
type SiteOption = { id: string; name: string; active: boolean };
type DepartmentOption = { id: string; name: string; siteId: string | null; active: boolean };
type MembershipOptions = { users: UserOption[]; sites: SiteOption[]; departments: DepartmentOption[] };

export function MembershipAdministration({ embedded = false }: { embedded?: boolean }) {
  const [open, setOpen] = useState(embedded);
  const [options, setOptions] = useState<MembershipOptions | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [siteIds, setSiteIds] = useState<string[]>([]);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(embedded);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/admin/memberships", { credentials: "same-origin" });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setOptions(null);
      setError(response.status === 403 ? "Organizational membership changes require administration access." : body?.error || "Unable to load memberships.");
      return;
    }
    const next = body.data as MembershipOptions;
    setOptions(next);
    const first = next.users[0];
    if (first) selectUser(first.id, next);
  }

  useEffect(() => {
    if (!embedded) return;
    let active = true;
    fetch("/api/admin/memberships", { credentials: "same-origin" })
      .then(async (response) => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (!active) return;
        setBusy(false);
        if (!response.ok) {
          setOptions(null);
          setError(response.status === 403 ? "Organizational membership changes require administration access." : body?.error || "Unable to load memberships.");
          return;
        }
        const next = body.data as MembershipOptions;
        setOptions(next);
        const first = next.users[0];
        if (first) {
          setSelectedUserId(first.id);
          setSiteIds(first.siteIds);
          setDepartmentIds(first.departmentIds);
        }
      })
      .catch(() => {
        if (!active) return;
        setBusy(false);
        setOptions(null);
        setError("Unable to load memberships.");
      });
    return () => {
      active = false;
    };
  }, [embedded]);

  function selectUser(userId: string, source = options) {
    setSelectedUserId(userId);
    const user = source?.users.find((item) => item.id === userId);
    setSiteIds(user?.siteIds ?? []);
    setDepartmentIds(user?.departmentIds ?? []);
  }

  function toggle(value: string, current: string[], setCurrent: (next: string[]) => void) {
    setCurrent(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/admin/memberships", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: selectedUserId, siteIds, departmentIds, reason: String(form.get("reason")) }),
    });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(body?.error || "Unable to update organizational memberships.");
      return;
    }
    setNotice(`Saved ${body.data.siteCount} site and ${body.data.departmentCount} department memberships with audit evidence.`);
    await load();
  }

  const eligibleDepartments = options?.departments.filter((department) => !department.siteId || siteIds.includes(department.siteId)) ?? [];

  const workspace = (
    <>
      {notice && <div className="notice" role="status"><span>{notice}</span></div>}
      {error && <div className="detail-error" role="alert">{error}</div>}
      {busy && !options && <p>Loading memberships…</p>}
      {options && (
        <form className="approval-box" onSubmit={submit}>
          <label>
            User
            <select value={selectedUserId} onChange={(event) => selectUser(event.target.value)} required>
              {options.users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.status}</option>)}
            </select>
          </label>
          <fieldset className="membership-options">
            <legend>Sites</legend>
            <div className="qms-two-column-list">
              {options.sites.filter((site) => site.active).map((site) => (
                <label key={site.id}><input type="checkbox" checked={siteIds.includes(site.id)} onChange={() => {
                  const nextSites = siteIds.includes(site.id) ? siteIds.filter((id) => id !== site.id) : [...siteIds, site.id];
                  setSiteIds(nextSites);
                  if (!nextSites.includes(site.id)) setDepartmentIds(departmentIds.filter((departmentId) => options.departments.find((department) => department.id === departmentId)?.siteId !== site.id));
                }} /> {site.name}</label>
              ))}
            </div>
          </fieldset>
          <fieldset className="membership-options">
            <legend>Departments</legend>
            <div className="qms-two-column-list">
              {eligibleDepartments.filter((department) => department.active).map((department) => (
                <label key={department.id}><input type="checkbox" checked={departmentIds.includes(department.id)} onChange={() => toggle(department.id, departmentIds, setDepartmentIds)} /> {department.name}</label>
              ))}
            </div>
          </fieldset>
          <label>
            Controlled reason
            <textarea name="reason" required minLength={3} maxLength={4000} />
          </label>
          <button className="primary-button" type="submit" disabled={busy || !selectedUserId}>Save memberships</button>
        </form>
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="admin-section-stack">
        <div className="section-heading">
          <h3>User memberships</h3>
          <p>Maintain authoritative site and department assignments used for governed audience expansion.</p>
        </div>
        {workspace}
      </div>
    );
  }

  return (
    <>
      <button type="button" style={{ position: "fixed", right: 840, bottom: 24, zIndex: 80 }} onClick={async () => { setOpen(true); setNotice(""); await load(); }}>
        User memberships
      </button>
      {open && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="membership-admin-title">
            <div className="modal-head">
              <div>
                <h2 id="membership-admin-title">User organizational memberships</h2>
                <p>Maintain authoritative site and department assignments used for governed audience expansion.</p>
              </div>
              <button aria-label="Close user memberships" onClick={() => setOpen(false)}>×</button>
            </div>
            <div className="detail-body">{workspace}</div>
          </div>
        </div>
      )}
    </>
  );
}
