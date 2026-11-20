"use client";

import { useEffect, useState } from "react";
import { DemoTrainingLesson } from "./demo-training-lesson";

type Assignment = { id: string; courseCode: string; courseTitle: string; assignedAt: string; dueAt: string | null; status: string };

export function MyTrainingWorkspace() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/training/my-assignments", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 403 ? "Your account is not linked to one active employee record. Contact your QMS administrator." : response.status === 401 ? "Sign in to view your training assignments." : "Training assignments could not be loaded.");
        const body: { data?: { assignments?: Assignment[] } } = await response.json();
        if (!controller.signal.aborted) setAssignments(body.data?.assignments ?? []);
      })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Training assignments could not be loaded."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  const selected = assignments.find((assignment) => assignment.id === selectedId);
  const formatDate = (value: string | null) => value ? value.slice(0, 10) : "Not set";
  return <section className="module-section-stack" aria-labelledby="my-training-heading">
    <div className="section-heading"><div><h2 id="my-training-heading">My Training</h2><p>Your assigned training, based on your signed-in employee account.</p></div></div>
    <p>Demonstration lessons and quizzes are for practice only. They do not create completion records or training credentials.</p>
    {loading && <p role="status">Loading your assignments…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && !assignments.length && <p>No training assignments are linked to your employee account.</p>}
    {!loading && !error && assignments.length > 0 && <div className="table-wrap"><table>
      <thead><tr><th>Course</th><th>Assigned</th><th>Due</th><th>Status</th><th>Practice</th></tr></thead>
      <tbody>{assignments.map((assignment) => <tr key={assignment.id}>
        <td>{assignment.courseTitle} ({assignment.courseCode})</td><td>{formatDate(assignment.assignedAt)}</td><td>{formatDate(assignment.dueAt)}</td><td>{assignment.status}</td>
        <td>{assignment.status === "ASSIGNED" && ["DEMO-HIPAA", "DEMO-BBP"].includes(assignment.courseCode) ? <button type="button" aria-expanded={selectedId === assignment.id} onClick={() => setSelectedId(selectedId === assignment.id ? "" : assignment.id)}>{selectedId === assignment.id ? "Close practice" : "Open practice lessons"}</button> : "Not available"}</td>
      </tr>)}</tbody>
    </table></div>}
    {selected && selected.status === "ASSIGNED" && ["DEMO-HIPAA", "DEMO-BBP"].includes(selected.courseCode) && <DemoTrainingLesson key={selected.id} courseCode={selected.courseCode} />}
  </section>;
}
