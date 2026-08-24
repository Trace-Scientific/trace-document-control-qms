"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Icon, type IconName } from "./icon";
import { filterDashboardDocuments } from "@/lib/documents/dashboard";

type Status = "Effective" | "In review" | "Draft" | "Review due";
type DocumentRow = { id: string; title: string; type: string; version: string; status: Status; owner: string; effective: string; due: string };

const initialDocuments: DocumentRow[] = [
  { id: "SOP-001", title: "Specimen Collection and Handling", type: "Standard Operating Procedure", version: "4.2", status: "Effective", owner: "Quality Systems", effective: "Aug 12, 2026", due: "Aug 12, 2027" },
  { id: "POL-014", title: "Document and Record Control", type: "Quality Policy", version: "3.0", status: "In review", owner: "James Ramsey", effective: "—", due: "Aug 28, 2026" },
  { id: "WI-032", title: "Daily Temperature Monitoring", type: "Work Instruction", version: "2.1", status: "Review due", owner: "Laboratory Operations", effective: "Sep 3, 2025", due: "Sep 3, 2026" },
  { id: "FRM-022", title: "Corrective Action Investigation", type: "Controlled Form", version: "1.0", status: "Draft", owner: "Quality Systems", effective: "—", due: "—" },
  { id: "SOP-018", title: "Result Review and Release", type: "Standard Operating Procedure", version: "5.1", status: "Effective", owner: "Technical Operations", effective: "Jul 22, 2026", due: "Jul 22, 2027" },
];

const nav: { label: string; icon: IconName; count?: number }[] = [
  { label: "Overview", icon: "grid" }, { label: "Documents", icon: "file" }, { label: "Review queue", icon: "review", count: 4 },
  { label: "Personnel", icon: "users" }, { label: "Reports", icon: "chart" }, { label: "Administration", icon: "settings" },
];

function StatusBadge({ status }: { status: Status }) {
  return <span className={`status status-${status.toLowerCase().replace(" ", "-")}`}><span />{status}</span>;
}

export function DocumentControlDashboard() {
  const [documents, setDocuments] = useState(initialDocuments);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All documents");
  const [dialog, setDialog] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [notice, setNotice] = useState("");

  const visible = useMemo(
    () => filterDashboardDocuments(documents, query, filter),
    [documents, query, filter],
  );

  function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title"));
    const code = String(form.get("number"));
    const type = String(form.get("type"));
    setDocuments((current) => [{ id: code, title, type, version: "0.1", status: "Draft", owner: "James Ramsey", effective: "—", due: "—" }, ...current]);
    setDialog(false);
    setNotice(`${code} was added to this preview as a draft. Server persistence requires an authenticated organization session.`);
  }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <div className="brand"><div className="brand-mark"><Icon name="shield" /></div><div><strong>TRACE</strong><span>QUALITY SYSTEMS</span></div></div>
      <button className="sidebar-close" aria-label="Close navigation" onClick={() => setMobileNav(false)}><Icon name="close" /></button>
      <div className="workspace"><span>WORKSPACE</span><button>Trace Scientific<Icon name="chevron" /></button></div>
      <nav aria-label="Primary navigation">{nav.map((item) => <button key={item.label} className={item.label === "Documents" ? "active" : ""}><Icon name={item.icon}/><span>{item.label}</span>{item.count && <b>{item.count}</b>}</button>)}</nav>
      <div className="sidebar-foot"><div className="compliance"><Icon name="shield"/><div><strong>Audit controls active</strong><span>Evidence is append-only</span></div></div><div className="user-card"><div className="avatar">JR</div><div><strong>James Ramsey</strong><span>Quality Administrator</span></div><Icon name="more"/></div></div>
    </aside>

    <div className="main-column">
      <header className="topbar">
        <button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Icon name="menu"/></button>
        <div className="global-search"><Icon name="search"/><input aria-label="Global search" placeholder="Search QMS records"/><kbd>⌘ K</kbd></div>
        <button className="icon-button" aria-label="Notifications"><Icon name="bell"/><span className="notification-dot"/></button>
        <div className="top-avatar">JR</div>
      </header>

      <main className="workspace-main">
        <div className="preview-banner"><span>VALIDATION WORKSPACE</span> Demonstration records only — no patient information</div>
        <div className="page-heading"><div><p className="eyebrow">POLICY &amp; DOCUMENTATION</p><h1>Document control</h1><p>Manage controlled content, approvals, effective versions, and review schedules.</p></div><button className="primary-button" onClick={() => setDialog(true)}><Icon name="plus"/>New document</button></div>

        {notice && <div className="notice" role="status"><Icon name="check"/><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice("")}><Icon name="close"/></button></div>}

        <section className="metric-grid" aria-label="Document summary">
          <article><span className="metric-icon blue"><Icon name="file"/></span><div><span>CONTROLLED DOCUMENTS</span><strong>128</strong><small><b>+6</b> this quarter</small></div></article>
          <article><span className="metric-icon amber"><Icon name="review"/></span><div><span>AWAITING REVIEW</span><strong>4</strong><small>2 assigned to you</small></div></article>
          <article><span className="metric-icon violet"><Icon name="clock"/></span><div><span>REVIEWS DUE SOON</span><strong>7</strong><small>Next 30 days</small></div></article>
          <article><span className="metric-icon green"><Icon name="check"/></span><div><span>ACKNOWLEDGMENT</span><strong>96%</strong><small>Current completion rate</small></div></article>
        </section>

        <div className="content-grid">
          <section className="panel documents-panel">
            <div className="panel-header"><div><h2>Controlled documents</h2><p>Current and in-process versions</p></div><button className="text-button">View archive <Icon name="chevron"/></button></div>
            <div className="toolbar"><div className="table-search"><Icon name="search"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, number, or type" aria-label="Search documents"/></div><select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by status"><option>All documents</option><option>Effective</option><option>In review</option><option>Review due</option><option>Draft</option></select></div>
            <div className="table-wrap"><table><thead><tr><th>Document</th><th>Status</th><th>Version</th><th>Owner</th><th>Effective</th><th>Review due</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visible.map((document) => <tr key={`${document.id}-${document.version}`}><td><a href="#">{document.title}</a><span>{document.id} · {document.type}</span></td><td><StatusBadge status={document.status}/></td><td>v{document.version}</td><td>{document.owner}</td><td>{document.effective}</td><td className={document.status === "Review due" ? "due" : ""}>{document.due}</td><td><button className="row-action" aria-label={`Actions for ${document.title}`}><Icon name="more"/></button></td></tr>)}</tbody></table>{visible.length === 0 && <div className="empty-state"><Icon name="search"/><strong>No documents found</strong><span>Try another title, number, or status.</span></div>}</div>
            <div className="table-footer"><span>Showing {visible.length} of {documents.length} preview records</span><div><button disabled>Previous</button><button>Next</button></div></div>
          </section>

          <aside className="side-stack">
            <section className="panel queue-panel"><div className="panel-header"><div><h2>Your review queue</h2><p>Items requiring action</p></div><span className="count-pill">2</span></div>
              <div className="queue-item"><div className="queue-top"><span className="type-chip">POLICY</span><span>Due in 4 days</span></div><strong>Document and Record Control</strong><span>POL-014 · Version 3.0</span><div className="queue-meta"><div className="mini-avatar">MQ</div><span>Submitted by Maria Quinn</span></div><button>Open review <Icon name="chevron"/></button></div>
              <div className="queue-item"><div className="queue-top"><span className="type-chip procedure">SOP</span><span>Due in 9 days</span></div><strong>Reagent Lot Verification</strong><span>SOP-027 · Version 2.0</span><div className="queue-meta"><div className="mini-avatar teal">DL</div><span>Submitted by David Lee</span></div><button>Open review <Icon name="chevron"/></button></div>
              <button className="queue-all">View complete review queue</button>
            </section>
            <section className="panel activity-panel"><div className="panel-header"><div><h2>Recent activity</h2><p>Controlled lifecycle events</p></div></div>
              <div className="activity"><span className="activity-dot green"><Icon name="check"/></span><div><strong>SOP-001 became effective</strong><p>Version 4.2 · Quality Systems</p><time>Today, 9:42 AM</time></div></div>
              <div className="activity"><span className="activity-dot blue"><Icon name="review"/></span><div><strong>POL-014 submitted for review</strong><p>Version 3.0 · Maria Quinn</p><time>Yesterday, 3:18 PM</time></div></div>
              <div className="activity"><span className="activity-dot gray"><Icon name="file"/></span><div><strong>FRM-022 draft created</strong><p>Version 1.0 · Quality Systems</p><time>Aug 21, 11:05 AM</time></div></div>
            </section>
          </aside>
        </div>
      </main>
    </div>

    {dialog && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setDialog(false)}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="new-title"><div className="modal-head"><div><span className="modal-icon"><Icon name="file"/></span><div><h2 id="new-title">Create controlled document</h2><p>Start a new document at draft version 0.1.</p></div></div><button aria-label="Close dialog" onClick={() => setDialog(false)}><Icon name="close"/></button></div><form onSubmit={createDraft}><label>Document title<input name="title" required maxLength={500} placeholder="e.g. Sample Accessioning Procedure" autoFocus/></label><div className="form-row"><label>Document number<input name="number" required maxLength={100} placeholder="SOP-000"/></label><label>Document type<select name="type" required><option>Standard Operating Procedure</option><option>Quality Policy</option><option>Work Instruction</option><option>Controlled Form</option></select></label></div><label>Change summary<textarea name="summary" required maxLength={4000} placeholder="Describe the purpose of this initial draft"/></label><div className="form-note"><Icon name="shield"/><span>The server verifies your organization, permissions, revision metadata, and content hash before saving.</span></div><div className="modal-actions"><button type="button" onClick={() => setDialog(false)}>Cancel</button><button className="primary-button" type="submit">Create draft</button></div></form></div></div>}
  </div>;
}
