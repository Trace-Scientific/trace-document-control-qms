import type { EquipmentImpactDisposition, EquipmentImpactHistoryEntry } from "@/lib/equipment/compliance";

export type EquipmentImpactHistoryRow = Omit<EquipmentImpactHistoryEntry, "assessedAt"> & { assessedAt: string };

const dispositionLabels: Record<EquipmentImpactDisposition, string> = {
  NO_IMPACT: "No impact",
  POTENTIAL_IMPACT: "Potential impact",
  CONFIRMED_IMPACT: "Confirmed impact",
};

export function EquipmentImpactHistory({ entries, holdLabels }: {
  entries: EquipmentImpactHistoryRow[] | null;
  holdLabels: ReadonlyMap<string, string>;
}) {
  return <div className="form-stack">
    <h4>Impact assessment history</h4>
    {entries?.length === 0 && <p>No impact assessments recorded.</p>}
    {entries?.map((entry, index) => <details key={entry.id} open={index === 0}>
      <summary>{dispositionLabels[entry.disposition]} · {entry.assessedAt.slice(0, 10)} UTC</summary>
      <dl className="quality-record-details">
        <dt>Assessed by</dt><dd>{entry.assessorName || "Recorded assessor"}</dd>
        <dt>Assessed at</dt>
        <dd><time dateTime={entry.assessedAt}>{entry.assessedAt.slice(0, 10)} {entry.assessedAt.slice(11, 19)} UTC</time></dd>
        {entry.holdId && <><dt>Compliance hold</dt><dd>{holdLabels.get(entry.holdId) ?? "Recorded compliance hold"}</dd></>}
        <dt>Affected scope</dt><dd>{entry.scopeSummary}</dd>
        <dt>Rationale</dt><dd>{entry.rationale}</dd>
        {entry.qualityEventNumber && <><dt>Related quality event</dt><dd>{entry.qualityEventNumber}</dd></>}
      </dl>
    </details>)}
  </div>;
}
