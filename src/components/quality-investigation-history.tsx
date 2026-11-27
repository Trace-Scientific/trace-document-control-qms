import type { QualityInvestigationHistoryEntry, RootCauseMethod } from "@/lib/quality/investigations";

export type Investigation = Omit<QualityInvestigationHistoryEntry, "createdAt"> & { createdAt: string };

export const rootCauseMethodLabels: Record<RootCauseMethod, string> = {
  FIVE_WHYS: "Five Whys",
  FISHBONE: "Fishbone",
  FAULT_TREE: "Fault tree",
  OTHER: "Other",
};

export function QualityInvestigationHistory({ investigations }: { investigations: Investigation[] | null }) {
  return <div className="module-section-stack">
    <h4>Investigation evidence</h4>
    {investigations?.length === 0 && <p>No investigation evidence recorded.</p>}
    {investigations?.map((record, index) => <details key={record.id} open={index === 0}>
      <summary>
        Investigation {record.sequence} · {rootCauseMethodLabels[record.rootCauseMethod]} · Risk score {record.riskScore}
      </summary>
      <dl className="quality-record-details">
        <dt>Recorded by</dt>
        <dd>{record.investigatorName || "Recorded investigator"}</dd>
        <dt>Recorded at</dt>
        <dd><time dateTime={record.createdAt}>{record.createdAt.slice(0, 10)} {record.createdAt.slice(11, 19)} UTC</time></dd>
        <dt>Findings</dt>
        <dd>{record.findings}</dd>
        <dt>Affected scope</dt>
        <dd>{record.affectedScope}</dd>
        <dt>Root cause</dt>
        <dd>{record.rootCause}</dd>
        <dt>Risk assessment</dt>
        <dd>Likelihood {record.riskLikelihood} × Impact {record.riskImpact} = {record.riskScore}</dd>
        {record.evidenceSummary && <><dt>Evidence summary</dt><dd>{record.evidenceSummary}</dd></>}
        {record.evidenceFileId && <><dt>Supporting evidence</dt><dd>File attached</dd></>}
      </dl>
    </details>)}
  </div>;
}
