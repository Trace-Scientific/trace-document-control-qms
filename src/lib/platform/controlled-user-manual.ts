export const CONTROLLED_USER_MANUAL = {
  code: "UM-QMS-001",
  name: "Trace QMS Controlled User Manual",
  description: "Authoritative controlled operating manual for authenticated Trace QMS users.",
  sections: [
    ["UM-01", "Document control and manual governance"],
    ["UM-02", "Access, authentication, and user responsibilities"],
    ["UM-03", "Navigation and contextual Help"],
    ["UM-04", "Document operations and controlled files"],
    ["UM-05", "Review queues and approval assignments"],
    ["UM-06", "Records management"],
    ["UM-07", "Personnel, credentials, and qualifications"],
    ["UM-08", "Training and competency"],
    ["UM-09", "Quality events"],
    ["UM-10", "Laboratory operations"],
    ["UM-11", "Reporting and analytics"],
    ["UM-12", "Administration and configuration"],
    ["UM-13", "Notifications"],
    ["UM-14", "Help, customer support, and controlled support access"],
    ["UM-15", "Evidence handling, integrity, and prohibited content"],
    ["UM-A", "Glossary and status definitions"],
  ] as const,
} as const;

export type ControlledUserManualSectionCode = typeof CONTROLLED_USER_MANUAL.sections[number][0];
