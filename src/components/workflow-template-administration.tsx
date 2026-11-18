"use client";

import { useEffect, useState, type FormEvent } from "react";

type WorkflowTemplate = {
  id: string;
  key: string;
  version: number;
  name: string;
  active: boolean;
  stages: Array<{ name: string; dueDays: number }>;
};

export function WorkflowTemplateAdministration() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [stageCount, setStageCount] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    const response = await fetch("/api/documents/workflow/templates", { credentials: "same-origin" });
    const body = await response.json().catch(() => null);
    if (response.ok) setTemplates(body.data ?? []);
    else setError(body?.error || "Workflow templates could not be loaded.");
  }

  useEffect(() => {
    let active = true;
    fetch("/api/documents/workflow/templates", { credentials: "same-origin" })
      .then(async (response) => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        if (!active) return;
        if (response.ok) setTemplates(body?.data ?? []);
        else setError(body?.error || "Workflow templates could not be loaded.");
      })
      .catch(() => {
        if (active) setError("Workflow templates could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const stageNames = form.getAll("templateStageName").map(String);
    const dueDays = form.getAll("templateDueDays").map(Number);
    setBusy(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/documents/workflow/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "CREATE_VERSION",
        key: String(form.get("templateKey")),
        name: String(form.get("templateName")),
        stages: stageNames.map((name, index) => ({ name, dueDays: dueDays[index] })),
      }),
    });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(body?.error || "The workflow template could not be created.");
      return;
    }
    event.currentTarget.reset();
    await load();
    setNotice("A new immutable workflow-template version was activated.");
  }

  async function setActive(template: WorkflowTemplate, active: boolean) {
    const reason = window.prompt(active ? "Reason for activation" : "Reason for deactivation");
    if (!reason?.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/documents/workflow/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "SET_ACTIVE", templateId: template.id, active, reason }),
    });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(body?.error || "The workflow-template state could not be changed.");
      return;
    }
    await load();
    setNotice(`Workflow template ${active ? "activated" : "deactivated"}.`);
  }

  return (
    <div className="admin-section-stack">
      <div className="section-heading">
        <h3>Review workflow templates</h3>
        <p>Manage immutable, versioned review-stage definitions.</p>
      </div>
      {error && <div className="detail-error" role="alert">{error}</div>}
      {notice && <div className="detail-notice" role="status">{notice}</div>}
      <div className="template-layout">
        <div className="template-list qms-two-column-list">
          {templates.map((template) => (
            <article key={template.id}>
              <div><strong>{template.name}</strong><span>{template.key} · v{template.version}</span></div>
              <ol>{template.stages.map((stage) => <li key={`${stage.name}-${stage.dueDays}`}>{stage.name} <span>{stage.dueDays} day target</span></li>)}</ol>
              <button className="text-button" type="button" disabled={busy} onClick={() => setActive(template, !template.active)}>
                {template.active ? "Deactivate" : "Activate"}
              </button>
            </article>
          ))}
          {!templates.length && !error && <p>No workflow templates configured.</p>}
        </div>
        <form className="template-form" onSubmit={createTemplate}>
          <strong>Create template version</strong>
          <label>Template key<input name="templateKey" required pattern="[a-z][a-z0-9_-]{1,49}" placeholder="document-approval" /></label>
          <label>Display name<input name="templateName" required maxLength={100} /></label>
          {Array.from({ length: stageCount }, (_, index) => index + 1).map((stage) => (
            <div className="template-stage" key={stage}>
              <label>Stage {stage}<input name="templateStageName" required placeholder={stage === 1 ? "Quality review" : "Operations review"} /></label>
              <label>Target days<input name="templateDueDays" type="number" min={1} max={365} required /></label>
            </div>
          ))}
          <div className="template-stage-actions">
            <button type="button" disabled={busy || stageCount >= 10} onClick={() => setStageCount((count) => count + 1)}>Add stage</button>
            <button type="button" disabled={busy || stageCount <= 1} onClick={() => setStageCount((count) => count - 1)}>Remove last</button>
          </div>
          <button className="primary-button" disabled={busy} type="submit">Create and activate</button>
        </form>
      </div>
    </div>
  );
}
