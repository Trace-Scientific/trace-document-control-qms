"use client";

import { useState, type FormEvent } from "react";

type Question = { prompt: string; choices: string[] };
type Assessment = { passingScorePercent: number; questions: Question[] };
type Result = { attemptId: string; scorePercent: number; passed: boolean; correctCount: number; questionCount: number };

export function AssignedTrainingAssessment({ assignmentId, assessment, onRecorded }: { assignmentId: string; assessment: Assessment; onRecorded?: () => void }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const questions = assessment.questions;
  const complete = questions.length > 0 && questions.every((question, index) =>
    Number.isInteger(answers[index]) && answers[index] >= 0 && answers[index] < question.choices.length
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!complete || busy || result) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/training/my-assessment-attempts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId, answers: questions.map((_, index) => answers[index]) }),
      });
      const body: { data?: Result; error?: string } = await response.json();
      if (!response.ok || !body.data) throw new Error(body.error || "Assessment submission failed.");
      setResult(body.data);
      onRecorded?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Assessment submission failed.");
    } finally {
      setBusy(false);
    }
  }

  return <section aria-label="Assigned course assessment">
    <h4>Course assessment</h4>
    <p>Answer every question and submit for scoring. Passing does not automatically create a training completion record or certificate.</p>
    {questions.length === 0 ? <p>No assessment questions are available for this course.</p> : <form onSubmit={(event) => void submit(event)}>
      {questions.map((question, index) => <fieldset key={index} disabled={busy || result !== null}>
        <legend>{index + 1}. {question.prompt}</legend>
        {question.choices.map((choice, choiceIndex) => <label key={choiceIndex} style={{ display: "block" }}>
          <input type="radio" name={`assessment-question-${index}`} checked={answers[index] === choiceIndex}
            onChange={() => setAnswers((current) => ({ ...current, [index]: choiceIndex }))} />
          {" "}{choice}
        </label>)}
      </fieldset>)}
      {!result && <button type="submit" disabled={!complete || busy}>{busy ? "Submitting…" : "Submit assessment"}</button>}
    </form>}
    {error && <p role="alert">{error}</p>}
    {result && <div role="status">
      <strong>{result.passed ? "Passed" : "Not passed"} — {result.scorePercent}%</strong>
      <p>{result.correctCount} of {result.questionCount} answers correct. Required score: {assessment.passingScorePercent}%.</p>
      <p>{result.passed ? "Passing assessment recorded. Your training manager must verify and record official completion before your certificate becomes available." : "Assessment attempt recorded. Review the course material before trying again."}</p>
      {!result.passed && <button type="button" disabled={busy} onClick={() => { setAnswers({}); setResult(null); setError(""); }}>Retry assessment</button>}
    </div>}
  </section>;
}
