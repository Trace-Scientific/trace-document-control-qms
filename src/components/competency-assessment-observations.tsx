"use client";

import { useEffect, useState } from "react";
import type { CompetencyObservation } from "@/lib/training/competency";

type RecordedSignature = {
  signerUserId: string;
  meaningText: string;
  signedAt: string;
  status: "VALID" | "INVALIDATED";
};
type AssessmentDetails = { data: CompetencyObservation[]; signature: RecordedSignature | null };

const outcomeLabels: Record<CompetencyObservation["outcome"], string> = {
  PASS: "Pass",
  FAIL: "Fail",
  NOT_APPLICABLE: "Not applicable",
};

export function CompetencyAssessmentObservations({ assessmentId }: { assessmentId: string }) {
  const [details, setDetails] = useState<AssessmentDetails>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/training/competency/assessments/${encodeURIComponent(assessmentId)}`, {
      signal: controller.signal, cache: "no-store",
    }).then(async (response) => {
      if (!response.ok) throw new Error("Observations unavailable.");
      const body = await response.json() as AssessmentDetails;
      if (!controller.signal.aborted) setDetails(body);
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
  if (!details) return <p role="status">Loading assessment details…</p>;

  return <div className="module-section-stack">
    <h4>Electronic sign-off</h4>
    {details.signature ? <div>
      <p>{details.signature.status === "VALID" ? "Signed" : "Signature invalidated"} · {new Date(details.signature.signedAt).toLocaleString()}</p>
      <p>Signer account <code>{details.signature.signerUserId}</code></p>
      <p>{details.signature.meaningText}</p>
    </div> : <p>No electronic signature recorded.</p>}
    <h4>Recorded method results</h4>
    {details.data.length ? <dl>
      {details.data.map((observation) => <div key={observation.elementId}>
        <dt>{observation.code} · {observation.title}</dt>
        <dd><strong>{outcomeLabels[observation.outcome]}</strong>{observation.notes && <p>{observation.notes}</p>}</dd>
      </div>)}
    </dl> : <p>No method results were recorded for this assessment.</p>}
  </div>;
}
