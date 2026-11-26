"use client";

import { useRef, useState, type FormEvent } from "react";
import { cliaCompetencyMethods } from "@/lib/training/clia-competency-methods";

type ProgramOption = { id: string; code: string; title: string };
type DraftElement = {
  code: string;
  title: string;
  method: string;
  required: boolean;
};

const presets = cliaCompetencyMethods.map((method) => ({ ...method, required: true }));

export function CliaCompetencyProgramBuilder({ programs, onSaved }: {
  programs: ProgramOption[];
  onSaved: (programId: string) => void;
}) {
  const [programId, setProgramId] = useState("");
  const [elements, setElements] = useState<DraftElement[]>(presets);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const program = programs.find((option) => option.id === programId);

  function updateElement(code: string, changes: Partial<Omit<DraftElement, "code">>) {
    setElements((current) => current.map((element) => element.code === code ? { ...element, ...changes } : element));
  }

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const trimmed = elements.map((element) => ({ ...element, title: element.title.trim(), method: element.method.trim() }));
    if (trimmed.some(({ title, method }) => !title || !method)) {
      setError("Enter a title and assessment instructions for every method.");
      return;
    }
    setElements(trimmed);
    setReviewing(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!program || submitting.current) return;

    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/training/competency/elements/clia-template", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ programId: program.id, elements }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error || "Unable to save the CLIA methods. Retry the save.");
        return;
      }

      setReviewing(false);
      setProgramId("");
      setElements(presets);
      setSuccess(`Saved all six CLIA methods for ${program.code} · ${program.title}.`);
      onSaved(program.id);
    } catch {
      setError("The connection was interrupted. Retry the save. If it already succeeded, the program will reject duplicate codes.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="module-section-stack">
      <div className="section-heading">
        <div>
          <h3>Six-method CLIA template</h3>
          <p>Configure six assessment methods together for an active program without recorded assessments.</p>
        </div>
      </div>
      {success && <p role="status">{success}</p>}
      {error && <p role="alert">{error}</p>}
      {reviewing && program ? (
        <form className="admin-form clia-template-form" onSubmit={save} aria-label="Review CLIA methods">
          <h4>Review methods for {program.code} · {program.title}</h4>
          <ol>
            {elements.map((element) => (
              <li key={element.code}>
                <strong>{element.code} · {element.title}</strong> ({element.required ? "Required" : "Optional"})
                <p>{element.method}</p>
              </li>
            ))}
          </ol>
          <button type="button" disabled={saving} onClick={() => { setReviewing(false); setError(""); }}>Edit methods</button>
          <button type="submit" disabled={saving}>{saving ? "Saving methods…" : "Save all six methods"}</button>
        </form>
      ) : (
        <form className="admin-form clia-template-form" onSubmit={review} aria-label="Configure CLIA methods">
          <label>
            Program
            <select value={programId} required onChange={(event) => {
              setProgramId(event.target.value);
              setElements(presets);
              setSuccess("");
              setError("");
            }}>
              <option value="">Select an active program</option>
              {programs.map((option) => <option key={option.id} value={option.id}>{option.code} · {option.title}</option>)}
            </select>
          </label>
          {program && elements.map((element) => (
            <fieldset key={element.code}>
              <legend>{element.code}</legend>
              <label>
                Title
                <input maxLength={240} required value={element.title}
                  onChange={(event) => updateElement(element.code, { title: event.target.value })} />
              </label>
              <label>
                Assessment instructions
                <textarea maxLength={500} required value={element.method}
                  onChange={(event) => updateElement(element.code, { method: event.target.value })} />
              </label>
              <label>
                <input type="checkbox" checked={element.required}
                  onChange={(event) => updateElement(element.code, { required: event.target.checked })} /> Required
              </label>
            </fieldset>
          ))}
          <button type="submit" disabled={!program}>Review all six methods</button>
        </form>
      )}
    </section>
  );
}
