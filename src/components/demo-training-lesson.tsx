"use client";

import { useState } from "react";

import { catalog } from "../lib/training/demo-quiz";

export function DemoTrainingLesson({ courseCode, assignmentId, employeePractice = false }: { courseCode: string; assignmentId?: string; employeePractice?: boolean }) {
  const course = catalog[courseCode];
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showResults, setShowResults] = useState(false);
  const [serverResult, setServerResult] = useState<{ correct: number; total: number; percentage: number; recorded: false } | null>(null);
  const [serverError, setServerError] = useState("");
  const [checking, setChecking] = useState(false);
  async function checkAnswers() {
    if (!assignmentId) { setShowResults(true); return; }
    setChecking(true); setServerError(""); setServerResult(null);
    try {
      const response = await fetch(employeePractice ? "/api/training/my-assessment-preview" : "/api/training/demo-assessment-preview", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify({ assignmentId, answers: course.questions.map((_, index) => answers[index]) }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) { setServerError(body?.error || "Assessment preview unavailable."); return; }
      if (body?.data?.recorded !== false || typeof body.data.correct !== "number" || typeof body.data.total !== "number" || typeof body.data.percentage !== "number") { setServerError("Invalid assessment preview response."); return; }
      setServerResult(body.data); setShowResults(true);
    } catch { setServerError("Unable to reach the assessment preview service."); }
    finally { setChecking(false); }
  }
  if (!course) return null;
  const answeredCount = course.questions.filter((_, index) => answers[index] !== undefined).length;
  const answered = answeredCount === course.questions.length;
  const score = course.questions.filter((question, index) => answers[index] === question.correct).length;
  return <section className="module-section-stack" aria-label={course.title}>
    <h4>{course.title} — Interactive awareness preview</h4>
    <p><strong>Demonstration only:</strong> {course.disclaimer}</p>
    <p>Open any lesson below to review its content before answering the practice questions.</p>
    {course.lessons.map((lesson, index) => <details key={lesson.heading} open={index === 0 ? true : undefined}><summary>Lesson {index + 1}: {lesson.heading}</summary><article><p>{lesson.content}</p></article></details>)}
    <h5>Knowledge check</h5>
    <p role="status">Questions answered: {answeredCount} of {course.questions.length}. {answered ? "Ready to check your practice answers." : "Answer every question to enable scoring."}</p>
    <p>Practice questions only. {assignmentId ? "A server-verified practice score is available. Nothing is recorded as an employee completion." : "Answers and scores stay in this browser view and do not create a training completion or credential."}</p>
    {course.questions.map((question, index) => <fieldset key={question.prompt} disabled={showResults}>
      <legend>{index + 1}. {question.prompt}</legend>
      {question.options.map((option, optionIndex) => <label key={option}><input type="radio" name={`demo-question-${index}`} checked={answers[index] === optionIndex} onChange={() => setAnswers((previous) => ({ ...previous, [index]: optionIndex }))} /> {option}</label>)}
      {showResults && <p>{answers[index] === question.correct ? "Correct." : "Review needed."} {question.explanation}</p>}
    </fieldset>)}
    {serverError && <p role="alert">{serverError}</p>}
    {showResults ? <div><p role="status">{serverResult ? `Server-verified practice score: ${serverResult.correct} of ${serverResult.total} (${serverResult.percentage}%).` : `Practice score: ${score} of ${course.questions.length}.`} This is not a recorded training completion.</p><button type="button" onClick={() => { setAnswers({}); setShowResults(false); setServerResult(null); setServerError(""); }}>Try again</button></div> : <button type="button" disabled={!answered || checking} onClick={() => { void checkAnswers(); }}>{checking ? "Checking answers…" : assignmentId ? "Check answers on server" : "Check practice answers"}</button>}
  </section>;
}
