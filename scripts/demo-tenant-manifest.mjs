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
  ["DEMO-SOP-009", "Document Review and Periodic Reapproval", "SOP"],
  ["DEMO-SOP-010", "Critical Result Communication", "SOP"],
  ["DEMO-SOP-011", "Sample Storage and Disposal", "SOP"],
  ["DEMO-SOP-012", "Internal Quality Audit", "SOP"],
  ["DEMO-SOP-013", "Supplier Qualification and Monitoring", "SOP"],
  ["DEMO-POL-003", "Records Retention and Archiving", "POL"],
  ["DEMO-POL-004", "Incident Reporting and Escalation", "POL"],
  ["DEMO-WI-003", "Daily Temperature Monitoring", "WI"],
  ["DEMO-WI-004", "Document Revision Request", "WI"],
  ["DEMO-WI-005", "Reagent Lot Receipt and Verification", "WI"],
  ["DEMO-FRM-004", "Equipment Maintenance Log", "FRM"],
  ["DEMO-FRM-005", "Personnel Training Record", "FRM"],
  ["DEMO-FRM-006", "Competency Assessment Checklist", "FRM"],
  ["DEMO-FRM-007", "Internal Audit Checklist", "FRM"],
  ["DEMO-FRM-008", "CAPA Effectiveness Review", "FRM"],
].map(([documentNumber, title, documentTypeCode]) =>
  Object.freeze({ documentNumber, title, documentTypeCode })
));

// Synthetic, non-provisioning course catalog for future owner-approved demo seeding.
// These are awareness outlines, not accredited instruction or proof of competency.
export const DEMO_TRAINING_COURSES = Object.freeze([
  Object.freeze({
    code: "DEMO-TRN-HIPAA-001",
    title: "HIPAA Privacy and Security Awareness (Demonstration)",
    description: "Synthetic awareness course covering minimum necessary access, safeguarding protected health information, recognizing suspected incidents, and reporting through laboratory policy. Demonstration only; not a compliance certification.",
    topics: Object.freeze(["Minimum necessary access", "Secure handling and disclosure", "Incident recognition and reporting"]),
  }),
  Object.freeze({
    code: "DEMO-TRN-BBP-001",
    title: "Bloodborne Pathogens Safety Awareness (Demonstration)",
    description: "Synthetic safety awareness course covering exposure routes, universal precautions, sharps handling, PPE, and immediate exposure reporting. Demonstration only; not a substitute for site-specific OSHA training or competency assessment.",
    topics: Object.freeze(["Exposure routes and precautions", "PPE and sharps safety", "Exposure response and reporting"]),
  }),
]);

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
  if (!unique(DEMO_TRAINING_COURSES.map((course) => course.code))) throw new Error("Duplicate demo training course");
  if (DEMO_TRAINING_COURSES.some((course) => !course.code.startsWith("DEMO-") || !course.title || !course.description || course.topics.length === 0)) throw new Error("Invalid demo training course");
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
    trainingCourses: DEMO_TRAINING_COURSES.length,
  };
}
