"use client";

import { useEffect, useState } from "react";

type Attempt = {
  id: string; employeeName: string; courseCode: string; courseTitle: string;
  submittedAt: string; scorePercent: number; passingScorePercent: number;
  passed: boolean; correctCount: number; questionCount: number;
};

export function TrainingAssessmentReport() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/training/assessment-report", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 403 ? "Manager training permission is required." : "Assessment report could not be loaded.");
        const body: { data?: { attempts?: Attempt[] } } = await response.json();
        if (!controller.signal.aborted) setAttempts(body.data?.attempts ?? []);
      })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Assessment report could not be loaded."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  return <section aria-labelledby="training-assessment-report-heading">
    <h3 id="training-assessment-report-heading">Employee assessment results</h3>
    <p>Most recent 100 recorded assessment attempts. Scores are not official training completions or certificates.</p>
    {loading && <p role="status">Loading assessment results…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && attempts.length === 0 && <p>No assessment attempts have been recorded.</p>}
    {!loading && !error && attempts.length > 0 && <div className="table-wrap"><table>
      <thead><tr><th>Employee</th><th>Course</th><th>Submitted</th><th>Score</th><th>Required</th><th>Result</th></tr></thead>
      <tbody>{attempts.map((attempt) => <tr key={attempt.id}>
        <td>{attempt.employeeName}</td>
        <td>{attempt.courseTitle} ({attempt.courseCode})</td>
        <td>{attempt.submittedAt.slice(0, 10)}</td>
        <td>{attempt.scorePercent}% ({attempt.correctCount}/{attempt.questionCount})</td>
        <td>{attempt.passingScorePercent}%</td>
        <td>{attempt.passed ? "Passed" : "Not passed"}</td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
