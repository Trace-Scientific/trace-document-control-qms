export const DEMO_SITES = Object.freeze([
  { name: "Main Laboratory", siteType: "LABORATORY" },
  { name: "Sample Receiving", siteType: "COLLECTION" },
]);

export const DEMO_DEPARTMENTS = Object.freeze([
  "Quality Assurance",
  "Molecular Diagnostics",
  "Accessioning",
  "Laboratory Administration",
]);

export const DEMO_DOCUMENT_TYPES = Object.freeze([
  { code: "SOP", name: "Standard Operating Procedure", reviewMonths: 12 },
  { code: "POL", name: "Policy", reviewMonths: 24 },
  { code: "WI", name: "Work Instruction", reviewMonths: 12 },
  { code: "FRM", name: "Form", reviewMonths: 12 },
]);

export const DEMO_DOCUMENTS = Object.freeze([
  ["DEMO-SOP-001", "Specimen Receipt and Acceptance", "SOP"],
  ["DEMO-SOP-002", "Molecular Extraction Workflow", "SOP"],
  ["DEMO-SOP-003", "qPCR Amplification and QC Review", "SOP"],
  ["DEMO-SOP-004", "Document Control and Revision", "SOP"],
  ["DEMO-SOP-005", "Equipment Maintenance and Calibration", "SOP"],
  ["DEMO-SOP-006", "Temperature Excursion Management", "SOP"],
  ["DEMO-SOP-007", "Nonconforming Work and CAPA", "SOP"],
  ["DEMO-SOP-008", "Personnel Training and Competency", "SOP"],
  ["DEMO-POL-001", "Quality Policy", "POL"],
  ["DEMO-POL-002", "Data Access and Confidentiality", "POL"],
  ["DEMO-WI-001", "Barcode Label Verification", "WI"],
  ["DEMO-WI-002", "Daily Instrument Startup", "WI"],
  ["DEMO-FRM-001", "Specimen Rejection Log", "FRM"],
  ["DEMO-FRM-002", "Temperature Log", "FRM"],
  ["DEMO-FRM-003", "Corrective Action Record", "FRM"],
].map(([documentNumber, title, documentTypeCode]) =>
  Object.freeze({ documentNumber, title, documentTypeCode })
));

export const DEMO_PERSONAS = Object.freeze([
  { key: "quality-manager", firstName: "Morgan", lastName: "Vale", role: "Quality Manager" },
  { key: "lab-director", firstName: "Avery", lastName: "Quinn", role: "Laboratory Director" },
  { key: "technical-supervisor", firstName: "Jordan", lastName: "Ellis", role: "Technical Supervisor" },
  { key: "molecular-technologist", firstName: "Casey", lastName: "Rowan", role: "Molecular Technologist" },
  { key: "accessioning-lead", firstName: "Taylor", lastName: "Brooks", role: "Accessioning Lead" },
  { key: "training-coordinator", firstName: "Riley", lastName: "Parker", role: "Training Coordinator" },
]);

export function validateDemoManifest() {
  const unique = (values) => new Set(values).size === values.length;
  if (!unique(DEMO_DOCUMENT_TYPES.map((type) => type.code))) throw new Error("Duplicate demo document type");
  if (!unique(DEMO_DOCUMENTS.map((doc) => doc.documentNumber))) throw new Error("Duplicate demo document number");
  if (!unique(DEMO_PERSONAS.map((persona) => persona.key))) throw new Error("Duplicate demo persona");
  const types = new Set(DEMO_DOCUMENT_TYPES.map((type) => type.code));
  if (DEMO_DOCUMENTS.some((doc) => !types.has(doc.documentTypeCode))) throw new Error("Unknown document type");
  if (DEMO_DOCUMENTS.some((doc) => !doc.documentNumber.startsWith("DEMO-"))) throw new Error("Unlabeled document");
  return {
    sites: DEMO_SITES.length,
    departments: DEMO_DEPARTMENTS.length,
    documentTypes: DEMO_DOCUMENT_TYPES.length,
    documents: DEMO_DOCUMENTS.length,
    personas: DEMO_PERSONAS.length,
  };
}
