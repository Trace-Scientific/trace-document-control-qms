import type { CompetencyObservation } from "./competency";

type SignatureSummary = {
  signerUserId: string;
  meaningText: string;
  signedAt: Date;
  status: "VALID" | "INVALIDATED";
};

export type PrintableCompetencyAssessment = {
  id: string;
  organizationName: string;
  employeeNumber: string;
  employeeName: string;
  programCode: string;
  programTitle: string;
  scopeLabel: string | null;
  assessorName: string;
  assessorUserId: string;
  assessedAt: Date;
  expiresOn: string | null;
  outcome: "QUALIFIED" | "CONDITIONAL" | "NOT_QUALIFIED";
  previousAssessmentAt: Date | null;
  notes: string | null;
  fileId: string | null;
  fileName: string | null;
  observations: CompetencyObservation[];
  signature: SignatureSummary | null;
};

const outcomes = { QUALIFIED: "Qualified", CONDITIONAL: "Conditional", NOT_QUALIFIED: "Not qualified" };
const methodOutcomes = { PASS: "Pass", FAIL: "Fail", NOT_APPLICABLE: "Not applicable" };

function escapeHtml(text: string) {
  const escaped: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return text.replace(/[&<>"']/g, (character) => escaped[character]);
}

function formatUtc(value: Date) {
  return value.toISOString().slice(0, 19).replace("T", " ") + " UTC";
}

function field(label: string, value: string) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

export function renderCompetencyAssessment(record: PrintableCompetencyAssessment) {
  const { signature, observations } = record;
  const signatureSummary = signature ? `<dl class="fields">${[
    field("Status", signature.status === "VALID" ? "Signed" : "Signature invalidated"),
    field("Signer account", signature.signerUserId),
    field("Signed at", formatUtc(signature.signedAt)),
    field("Meaning", signature.meaningText),
  ].join("")}</dl>` : "<p>No electronic signature recorded.</p>";
  const methods = observations.length ? `<table><thead><tr><th scope="col">Method</th><th scope="col">Result</th><th scope="col">Observation</th></tr></thead><tbody>${
    observations.map((observation) => `<tr><td>${escapeHtml(`${observation.code} · ${observation.title}`)}</td><td>${escapeHtml(methodOutcomes[observation.outcome])}</td><td class="notes">${escapeHtml(observation.notes ?? "—")}</td></tr>`).join("")
  }</tbody></table>` : "<p>No method results were recorded.</p>";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Competency assessment record | Trace QMS</title>
<style>
body { color: #182b40; font: 15px/1.45 Arial, sans-serif; max-width: 850px; margin: 2.5rem auto; padding: 0 1.25rem; overflow-wrap: anywhere; }
h1 { margin: 0.25rem 0; font-size: 2rem; }
h2 { font-size: 1.1rem; margin-top: 1.5rem; border-bottom: 1px solid #ccd5e0; padding-bottom: .35rem; }
header { border-top: 5px solid #173c61; padding-top: 1rem; }
.fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem 1.5rem; }
dt { font-weight: bold; color: #284765; }
dd { margin: 0; }
thead { background: #edf2f7; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: .45rem .55rem; border: 1px solid #ccd5e0; text-align: left; vertical-align: top; }
.notes { white-space: pre-wrap; }
footer { margin-top: 1.5rem; border-top: 1px solid #ccd5e0; }
@page { margin: 0.65in; }
@media print { body { padding: 0; margin: 0; max-width: none; font-size: 10pt; } .print-action { display: none; } h2 { break-after: avoid; } .fields div { break-inside: avoid; } }
@media screen and (max-width: 480px) { .fields { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<p class="print-action">Use your browser’s Print command to print or save as PDF.</p>
<main>
<header><strong>${escapeHtml(record.organizationName)}</strong><h1>Competency assessment record</h1><p>Trace QMS · Record ${escapeHtml(record.id)}</p></header>
<section><h2>Assessment</h2><dl class="fields">${[
    field("Employee", `${record.employeeName} · ${record.employeeNumber}`),
    field("Program", `${record.programCode} · ${record.programTitle}`),
    ...(record.scopeLabel ? [field("Laboratory scope", record.scopeLabel)] : []),
    field("Evaluator", `${record.assessorName} · ${record.assessorUserId}`),
    field("Assessed at", formatUtc(record.assessedAt)),
    field("Outcome", outcomes[record.outcome]),
    field("Expiration", record.expiresOn ?? "No expiration recorded"),
    ...(record.previousAssessmentAt ? [field("Prior assessment", formatUtc(record.previousAssessmentAt))] : []),
    field("Evidence reference", record.fileId ? `${record.fileName ?? "Attached file"} · ${record.fileId}` : "No file attached"),
  ].join("")}</dl>${record.notes ? `<h3>Assessment notes</h3><p class="notes">${escapeHtml(record.notes)}</p>` : ""}</section>
<section><h2>Method results</h2>${methods}</section>
<section><h2>Electronic sign-off</h2>${signatureSummary}</section>
<footer><p>Record copy. Verify the record reference and supporting evidence in Trace QMS.</p></footer>
</main>
</body>
</html>`;
}
