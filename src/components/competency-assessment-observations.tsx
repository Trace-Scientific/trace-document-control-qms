"use client";

import { useEffect, useState } from "react";
import type { CompetencyObservation } from "@/lib/training/competency";

const outcomeLabels: Record<CompetencyObservation["outcome"], string> = {
  PASS: "Pass",
  FAIL: "Fail",
  NOT_APPLICABLE: "Not applicable",
};

export function CompetencyAssessmentObservations({ assessmentId }: { assessmentId: string }) {
  const [observations, setObservations] = useState<CompetencyObservation[]>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/training/competency/assessments/${encodeURIComponent(assessmentId)}`, {
      signal: controller.signal, cache: "no-store",
    }).then(async (response) => {
      if (!response.ok) throw new Error("Observations unavailable.");
      const body = await response.json() as { data: CompetencyObservation[] };
      if (!controller.signal.aborted) setObservations(body.data);
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [assessmentId, attempt]);

  if (failed) return <div role="status">
    Unable to load recorded observations.{" "}
    <button type="button" onClick={() => {
      setFailed(false);
      setAttempt((previous) => previous + 1);
    }}>Retry</button>
  </div>;
  if (!observations) return <p role="status">Loading recorded observations…</p>;
  if (!observations.length) return <p>No method results were recorded for this assessment.</p>;

  return <div className="module-section-stack">
    <h4>Recorded method results</h4>
    <dl>
      {observations.map((observation) => <div key={observation.elementId}>
        <dt>{observation.code} · {observation.title}</dt>
        <dd><strong>{outcomeLabels[observation.outcome]}</strong>{observation.notes && <p>{observation.notes}</p>}</dd>
      </div>)}
    </dl>
  </div>;
}
