"use client";

import { useEffect, useRef, useState } from "react";
import { DemoTrainingLesson } from "./demo-training-lesson";
import { AssignedTrainingAssessment } from "./assigned-training-assessment";

type AssessmentAttempt = { id: string; assignmentId: string; courseCode: string; courseTitle: string; submittedAt: string; scorePercent: number; passingScorePercent: number; passed: boolean; correctCount: number; questionCount: number };
type Completion = { id: string; assignmentId: string; courseCode: string; courseTitle: string; completedAt: string; result: string | null };

type PublishedLessons = { version: number; lessons: { heading: string; content: string }[]; assessment: { passingScorePercent: number; questions: { prompt: string; choices: string[] }[] } };
type Assignment = { id: string; courseCode: string; courseTitle: string; assignedAt: string; dueAt: string | null; status: string; publishedVersion?: number | null };

export function MyTrainingWorkspace() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [published, setPublished] = useState<PublishedLessons | null>(null);
  const lessonRequest = useRef<AbortController | null>(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [lessonError, setLessonError] = useState("");
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [attempts, setAttempts] = useState<AssessmentAttempt[]>([]);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [attemptLoading, setAttemptLoading] = useState(true);
  const [attemptError, setAttemptError] = useState("");
  const [completionLoading, setCompletionLoading] = useState(true);
  const [completionError, setCompletionError] = useState("");
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
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/training/my-assessment-history", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 403 ? "Your account is not linked to an active employee." : "Assessment history could not be loaded.");
        const body: { data?: { attempts?: AssessmentAttempt[] } } = await response.json();
        if (!controller.signal.aborted) setAttempts(body.data?.attempts ?? []);
      })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setAttemptError(reason instanceof Error ? reason.message : "Assessment history could not be loaded."); })
      .finally(() => { if (!controller.signal.aborted) setAttemptLoading(false); });
    void fetch("/api/training/my-completions", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 403 ? "Your account is not linked to one active employee record." : response.status === 401 ? "Sign in to view your completion history." : "Completion history could not be loaded.");
        const body: { data?: { completions?: Completion[] } } = await response.json();
        if (!controller.signal.aborted) setCompletions(body.data?.completions ?? []);
      })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setCompletionError(reason instanceof Error ? reason.message : "Completion history could not be loaded."); })
      .finally(() => { if (!controller.signal.aborted) setCompletionLoading(false); });
    return () => controller.abort();
  }, [historyRefresh]);
  useEffect(() => () => lessonRequest.current?.abort(), []);
  function selectPractice(id: string) {
    lessonRequest.current?.abort();
    setPublished(null);
    setLessonError("");
    setLessonLoading(false);
    setSelectedId(id);
  }
  async function viewApprovedLessons(id: string) {
    lessonRequest.current?.abort();
    const controller = new AbortController();
    lessonRequest.current = controller;
    setLessonLoading(true);
    setSelectedId(id);
    setPublished(null);
    setLessonError("");
    try {
      const response = await fetch(`/api/training/my-assignment-content?assignmentId=${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Approved lessons are unavailable for this assignment.");
      const body: { data: PublishedLessons } = await response.json();
      if (!controller.signal.aborted) setPublished(body.data);
    } catch (reason) {
      if (!controller.signal.aborted) setLessonError(reason instanceof Error ? reason.message : "Unable to load lessons.");
    } finally {
      if (!controller.signal.aborted) setLessonLoading(false);
    }
  }
  const selected = assignments.find((assignment) => assignment.id === selectedId);
  const today = new Date().toLocaleDateString("en-CA");
  const pendingCount = assignments.filter((assignment) => assignment.status === "ASSIGNED").length;
  const overdueCount = assignments.filter((assignment) => assignment.status === "ASSIGNED" && assignment.dueAt && assignment.dueAt.slice(0, 10) < today).length;
  const orderedAssignments = [...assignments].sort((left, right) => {
    const leftPending = left.status === "ASSIGNED" ? 0 : 1;
    const rightPending = right.status === "ASSIGNED" ? 0 : 1;
    if (leftPending !== rightPending) return leftPending - rightPending;
    return (left.dueAt?.slice(0, 10) || "9999-12-31").localeCompare(right.dueAt?.slice(0, 10) || "9999-12-31");
  });
  const nextPractice = orderedAssignments.find((assignment) => assignment.status === "ASSIGNED" && !assignment.publishedVersion && ["DEMO-HIPAA", "DEMO-BBP"].includes(assignment.courseCode));
  const formatDate = (value: string | null) => value ? value.slice(0, 10) : "Not set";
  return <section className="module-section-stack" aria-labelledby="my-training-heading">
    <div className="section-heading"><div><h2 id="my-training-heading">My Training</h2><p>Your assigned training, based on your signed-in employee account.</p></div></div>
    <p>Demonstration lessons and quizzes are for practice only. They do not create completion records or training credentials.</p>
    {!loading && !error && assignments.length > 0 && <p role="status">{pendingCount} assigned course{pendingCount === 1 ? "" : "s"} remaining; {overdueCount} overdue. Active assignments appear first, with the earliest due dates at the top.</p>}
    {!loading && !error && nextPractice && <div className="module-action-row"><button type="button" aria-expanded={selectedId === nextPractice.id} onClick={() => selectPractice(selectedId === nextPractice.id ? "" : nextPractice.id)}>{selectedId === nextPractice.id ? "Close next practice" : `Start next practice: ${nextPractice.courseTitle}`}</button></div>}
    {loading && <p role="status">Loading your assignments…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && !assignments.length && <p>No training assignments are linked to your employee account.</p>}
    {!loading && !error && assignments.length > 0 && <div className="table-wrap"><table>
      <thead><tr><th>Course</th><th>Assigned</th><th>Due</th><th>Status</th><th>Learning</th></tr></thead>
      <tbody>{orderedAssignments.map((assignment) => <tr key={assignment.id}>
        <td>{assignment.courseTitle} ({assignment.courseCode})</td><td>{formatDate(assignment.assignedAt)}</td><td>{formatDate(assignment.dueAt)}{assignment.status === "ASSIGNED" && assignment.dueAt && assignment.dueAt.slice(0, 10) < today ? " (Overdue)" : ""}</td><td>{assignment.status}</td>
        <td>{assignment.status === "ASSIGNED" && !assignment.publishedVersion && ["DEMO-HIPAA", "DEMO-BBP"].includes(assignment.courseCode) ? <button type="button" aria-expanded={selectedId === assignment.id} onClick={() => selectPractice(selectedId === assignment.id ? "" : assignment.id)}>{selectedId === assignment.id ? "Close practice" : "Open practice lessons"}</button> : assignment.status === "ASSIGNED" && assignment.publishedVersion ? <button type="button" onClick={() => void viewApprovedLessons(assignment.id)}>View approved lessons</button> : "Not available"}</td>
      </tr>)}</tbody>
    </table></div>}
    {lessonLoading && <p role="status">Loading approved course lessons…</p>}
    {lessonError && <p role="alert">{lessonError}</p>}
    {selected && published && <section aria-label="Approved assigned lessons"><h3>Approved course version {published.version}</h3>
      {published.lessons.map((lesson, index) => <article key={index}><h4>{lesson.heading}</h4><p style={{ whiteSpace: "pre-wrap" }}>{lesson.content}</p></article>)}
      <p>Assessment: {published.assessment.questions.length} questions. Passing threshold: {published.assessment.passingScorePercent}%. Submit your answers below for a recorded assessment result.</p>
      <AssignedTrainingAssessment key={selected.id} assignmentId={selected.id} assessment={published.assessment} onRecorded={() => { setAttemptLoading(true); setAttemptError(""); setHistoryRefresh(value => value + 1); }} />
      <p>Viewing lessons does not mark training complete.</p>
    </section>}
    {selected && selected.status === "ASSIGNED" && !selected.publishedVersion && ["DEMO-HIPAA", "DEMO-BBP"].includes(selected.courseCode) && <DemoTrainingLesson key={selected.id} courseCode={selected.courseCode} assignmentId={selected.id} employeePractice />}
    <section aria-labelledby="assessment-history-heading">
      <h3 id="assessment-history-heading">Assessment attempt history</h3>
      <p>Scores and passing results are separate from official training completions.</p>
      {attemptLoading && <p role="status">Loading assessment history…</p>}
      {attemptError && <p role="alert">{attemptError}</p>}
      {!attemptLoading && !attemptError && attempts.length === 0 && <p>No recorded assessment attempts.</p>}
      {!attemptLoading && !attemptError && attempts.length > 0 && <div className="table-wrap"><table>
        <thead><tr><th>Course</th><th>Submitted</th><th>Score</th><th>Result</th></tr></thead>
        <tbody>{attempts.map((attempt) => <tr key={attempt.id}>
          <td>{attempt.courseTitle} ({attempt.courseCode})</td>
          <td>{formatDate(attempt.submittedAt)}</td>
          <td>{attempt.scorePercent}% ({attempt.correctCount}/{attempt.questionCount})</td>
          <td>{attempt.passed ? "Passed" : "Not passed"}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    <section aria-labelledby="completion-history-heading">
      <h3 id="completion-history-heading">Official training completion history</h3>
      <button type="button" disabled={completionLoading || attemptLoading} onClick={() => { setCompletionLoading(true); setAttemptLoading(true); setCompletionError(""); setAttemptError(""); setHistoryRefresh(value => value + 1); }}>Refresh training history</button>
      <p>These are recorded training completions, separate from demonstration quiz practice scores.</p>
      {completionLoading && <p role="status">Loading completion history…</p>}
      {completionError && <p role="alert">{completionError}</p>}
      {!completionLoading && !completionError && completions.length === 0 && <p>No official training completions are recorded for your employee account.</p>}
      {!completionLoading && !completionError && completions.length > 0 && <div className="table-wrap"><table>
        <thead><tr><th>Course</th><th>Completed</th><th>Result</th><th>Certificate</th></tr></thead>
        <tbody>{completions.map((completion) => <tr key={completion.id}>
          <td>{completion.courseTitle} ({completion.courseCode})</td>
          <td>{formatDate(completion.completedAt)}</td>
          <td>{completion.result || "Not specified"}</td>
          <td><a href={`/api/training/my-completion-certificate?completionId=${encodeURIComponent(completion.id)}`} target="_blank" rel="noopener noreferrer">Print certificate</a></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </section>;
}
