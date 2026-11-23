"use client";

import { useEffect, useState, type FormEvent } from "react";

type NamedPerson = { id: string; firstName: string; lastName: string; status: string };
type User = NamedPerson & { email: string };
type Employee = NamedPerson & { employeeNumber: string };
type Link = { employeeId: string; userId: string };

const endpoint = "/api/training/employee-user-links";

export function TrainingEmployeeLinkAdministration({ users }: { users: User[] }) {
  const [records, setRecords] = useState<{ employees: Employee[]; links: Link[] } | null>(null);
  const [userId, setUserId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const options = { credentials: "same-origin", cache: "no-store", signal: controller.signal } as const;
    void Promise.all([fetch("/api/personnel", options), fetch(endpoint, options)])
      .then(async ([employees, links]) => {
        if (!employees.ok || !links.ok) throw new Error("Training links unavailable");
        const [employeeBody, linkBody] = await Promise.all([employees.json(), links.json()]);
        if (!controller.signal.aborted) setRecords({ employees: employeeBody.data, links: linkBody.data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Could not load employee linking options.");
      });
    return () => controller.abort();
  }, [refresh]);

  const links = records?.links ?? [];
  const employees = records?.employees ?? [];
  const usersById = new Map(users.map((user) => [user.id, user]));
  const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
  const linkedUserIds = new Set(links.map((link) => link.userId));
  const linkedEmployeeIds = new Set(links.map((link) => link.employeeId));
  const eligibleUsers = users.filter((user) => user.status === "ACTIVE" && !linkedUserIds.has(user.id));
  const eligibleEmployees = employees.filter((employee) => employee.status === "ACTIVE" && !linkedEmployeeIds.has(employee.id));
  const user = eligibleUsers.find((candidate) => candidate.id === userId);
  const employee = eligibleEmployees.find((candidate) => candidate.id === employeeId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !user || !employee) return;
    setNotice("");
    setError("");
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, employeeId }),
      });
      if (response.status === 409) {
        setConfirming(false);
        setRecords(null);
        setRefresh((value) => value + 1);
        setError("The account or employee is no longer eligible. Review the refreshed list.");
        return;
      }
      if (response.status !== 201) throw new Error("Employee link could not be saved");
      const { data: link } = await response.json() as { data: Link };
      setRecords((current) => current && { ...current, links: [...current.links, link] });
      setNotice(`Linked ${user.email} to ${employee.employeeNumber}.`);
      setUserId("");
      setEmployeeId("");
      setConfirming(false);
    } catch {
      setError("Could not save the employee link. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="detail-section" aria-label="Training employee links">
      <h3>Training employee links</h3>
      <p>Link a user account to its employee record so the user can view their own training assignments and completions.</p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!records && !error && <p role="status">Loading employee linking options…</p>}
      {!records && error && <button type="button" onClick={() => { setError(""); setRefresh((value) => value + 1); }}>Reload linking options</button>}
      {records && links.length === 0 && <p>No saved employee links.</p>}
      {links.length > 0 && (
        <div className="table-wrap">
          <table>
            <caption>Saved training employee links</caption>
            <thead>
              <tr>
                <th scope="col">User account</th>
                <th scope="col">Account status</th>
                <th scope="col">Employee record</th>
                <th scope="col">Employee status</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => {
                const linkedUser = usersById.get(link.userId);
                const linkedEmployee = employeesById.get(link.employeeId);
                return (
                  <tr key={link.userId}>
                    <td>{linkedUser ? `${linkedUser.firstName} ${linkedUser.lastName} · ${linkedUser.email}` : "Account unavailable"}</td>
                    <td>{linkedUser?.status ?? "Unavailable"}</td>
                    <td>{linkedEmployee ? `${linkedEmployee.employeeNumber} · ${linkedEmployee.firstName} ${linkedEmployee.lastName}` : "Employee unavailable"}</td>
                    <td>{linkedEmployee?.status ?? "Unavailable"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {records && (eligibleUsers.length === 0 || eligibleEmployees.length === 0) && <p>Linking requires an active, unlinked user and employee.</p>}
      {records && eligibleUsers.length > 0 && eligibleEmployees.length > 0 && (
        <form className="template-form" onSubmit={(event) => void submit(event)}>
          <label>Training user account
            <select value={userId} onChange={(event) => setUserId(event.target.value)} disabled={confirming || saving} required>
              <option value="">Select a user account</option>
              {eligibleUsers.map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName} · {item.email}</option>)}
            </select>
          </label>
          <label>Training employee record
            <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} disabled={confirming || saving} required>
              <option value="">Select an employee record</option>
              {eligibleEmployees.map((item) => <option key={item.id} value={item.id}>{item.employeeNumber} · {item.firstName} {item.lastName}</option>)}
            </select>
          </label>
          {confirming && user && employee && (
            <p role="status">Link {user.email} to {employee.employeeNumber} · {employee.firstName} {employee.lastName}?</p>
          )}
          <div>
            <button type="submit" className="primary-button" disabled={saving || !user || !employee}>
              {confirming ? "Confirm employee link" : "Review employee link"}
            </button>
            {confirming && <button type="button" className="secondary-button" disabled={saving} onClick={() => { setConfirming(false); setError(""); }}>Cancel</button>}
          </div>
        </form>
      )}
    </section>
  );
}
