"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { GovernedEvidenceFilePicker } from "@/components/governed-evidence-file-picker";

type Employee = { id: string; employeeNumber: string; firstName: string; lastName: string; status: "ACTIVE" | "INACTIVE" | "TERMINATED" };
type Credential = { id: string; employeeId: string; credentialType: string; credentialNumber: string | null; issuingAuthority: string | null; issuedAt: string | null; expiresAt: string | null; fileId: string | null; createdAt: string };

function formatDateOnly(value: string | null) {
  if (!value) return "—";
  const calendar = value.slice(0, 10);
  const [year, month, day] = calendar.split("-").map(Number);
  if (!year || !month || !day) return calendar;
  return `${month}/${day}/${year}`;
}

function dateOnlyTime(value: string | null) {
  if (!value) return null;
  const calendar = value.slice(0, 10);
  const [year, month, day] = calendar.split("-").map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

export function PersonnelCredentialWorkspace({ canManage, today }: { canManage: boolean; today: string }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [employeeResponse, credentialResponse] = await Promise.all([
      fetch("/api/personnel", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/personnel/credentials", { credentials: "same-origin", cache: "no-store" }),
    ]);
    if (employeeResponse.ok) setEmployees((await employeeResponse.json()).data ?? []);
    if (credentialResponse.ok) setCredentials((await credentialResponse.json()).data ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/personnel", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/personnel/credentials", { credentials: "same-origin", cache: "no-store" }),
    ]).then(async ([employeeResponse, credentialResponse]) => {
      if (cancelled) return;
      if (employeeResponse.ok) {
        const body = await employeeResponse.json();
        if (!cancelled) setEmployees(body.data ?? []);
      }
      if (credentialResponse.ok) {
        const body = await credentialResponse.json();
        if (!cancelled) setCredentials(body.data ?? []);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const todayStart = useMemo(() => dateOnlyTime(today) ?? 0, [today]);

  async function createCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setNotice("");
    const response = await fetch("/api/personnel/credentials", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        employeeId: String(form.get("employeeId")),
        credentialType: String(form.get("credentialType")),
        credentialNumber: String(form.get("credentialNumber")) || null,
        issuingAuthority: String(form.get("issuingAuthority")) || null,
        issuedAt: String(form.get("issuedAt")) || null,
        expiresAt: String(form.get("expiresAt")) || null,
        fileId: String(form.get("fileId")) || null,
      }),
    });
    const body = await response.json().catch(() => null); setBusy(false);
    if (!response.ok) return setNotice(body?.error || "Credential could not be created.");
    event.currentTarget.reset();
    setNotice("Credential recorded with audit evidence. Renewals should be recorded as new credential entries.");
    await load();
  }

  return <section className="workspace-section" aria-labelledby="personnel-credential-heading">
    <div className="section-heading"><div><p className="eyebrow">Personnel credentials</p><h2 id="personnel-credential-heading">Credential and expiration tracking</h2><p>Track licenses, certifications, registrations, and other governed credentials without rewriting credential history.</p></div></div>
    {canManage && <form onSubmit={createCredential} className="admin-form">
      <label>Employee<select name="employeeId" defaultValue="" required><option value="" disabled>Select employee</option>{employees.filter((employee) => employee.status !== "TERMINATED").map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeNumber} · {employee.lastName}, {employee.firstName}</option>)}</select></label>
      <label>Credential type<input name="credentialType" maxLength={160} required /></label>
      <label>Credential number<input name="credentialNumber" maxLength={160} /></label>
      <label>Issuing authority<input name="issuingAuthority" maxLength={240} /></label>
      <label>Issue date<input name="issuedAt" type="date" /></label>
      <label>Expiration date<input name="expiresAt" type="date" /></label>
      <GovernedEvidenceFilePicker disabled={busy} />
      <button type="submit" disabled={busy}>Record credential</button>
    </form>}
    {notice && <p role="status">{notice}</p>}
    <div className="table-wrap"><table><thead><tr><th>Employee</th><th>Credential</th><th>Number</th><th>Issuer</th><th>Issued</th><th>Expires</th><th>Status</th><th>Evidence</th></tr></thead><tbody>
      {credentials.map((credential) => {
        const employee = employeeById.get(credential.employeeId);
        const expirationTime = dateOnlyTime(credential.expiresAt);
        const expired = expirationTime !== null ? expirationTime < todayStart : false;
        return <tr key={credential.id}><td>{employee ? `${employee.employeeNumber} · ${employee.lastName}, ${employee.firstName}` : credential.employeeId}</td><td>{credential.credentialType}</td><td>{credential.credentialNumber ?? "—"}</td><td>{credential.issuingAuthority ?? "—"}</td><td>{formatDateOnly(credential.issuedAt)}</td><td>{formatDateOnly(credential.expiresAt)}</td><td>{expired ? "EXPIRED" : "CURRENT"}</td><td>{credential.fileId ? "Attached" : "—"}</td></tr>;
      })}
      {!credentials.length && <tr><td colSpan={8}>No governed personnel credentials have been recorded.</td></tr>}
    </tbody></table></div>
  </section>;
}
