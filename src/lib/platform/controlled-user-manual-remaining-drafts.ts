import type { ControlledUserManualSectionDraft } from "./controlled-user-manual-core-drafts";

export const CONTROLLED_USER_MANUAL_REMAINING_DRAFTS: readonly ControlledUserManualSectionDraft[] = [
  {
    sectionCode: "UM-07",
    title: "Personnel, credentials, and qualifications",
    changeSummary: "Initial launch operating guidance.",
    body: `Personnel management
The Personnel workspace preserves governed employee identity, status, job descriptions, and assignment history separately from application login accounts.

Personnel library
Search personnel by employee number, name, or status. Active assignments are shown with their linked job descriptions. Historical assignments remain identifiable after they are ended.

Employee lifecycle
Authorized personnel managers may activate, inactivate, or terminate an employee record. Status changes require a controlled reason. Termination also requires an effective termination date. A terminated personnel record is historical evidence and is not deleted.

Job descriptions and assignments
Authorized users may create governed job descriptions and assign active job descriptions to active employees. An assignment may be designated primary. Ending an assignment requires an end date and controlled reason.

Credentials
Credentials such as licenses, certifications, and registrations are recorded as governed entries with optional number, issuing authority, issue date, expiration date, and supporting evidence. Renewals should be recorded as new credential entries rather than rewriting historical credential evidence.

Qualifications
Use the Qualifications workspace to record governed qualification evidence for personnel according to the available configured workflow. Evidence attached to a qualification must meet the evidence-file controls described in UM-15.

Permissions
Management controls are shown only to users with the required personnel permissions. Absence of a control does not authorize an alternate or manual bypass.`,
  },
  {
    sectionCode: "UM-08",
    title: "Training and competency",
    changeSummary: "Initial launch operating guidance.",
    body: `Training management
The Training & competency module separates governed training assignment, completion, history, lifecycle actions, and course configuration.

Courses
Authorized users configure governed training courses. Only active courses should be used for new assignments.

Assignments
Training is assigned to governed personnel records. Assignment history is preserved. Due dates and lifecycle state identify current work but do not by themselves prove completion.

Completion
Record completion only after the required training activity has been completed. Where evidence is required, select an available governed evidence file or upload a new file and wait for malware scanning to pass before selection.

Lifecycle
Cancellation or other governed lifecycle actions must follow the controls presented by the application and preserve the reason/history required by that action.

Competency
Competency programs contain configured elements and assessment methods. Authorized users record assessments against required elements and capture the governed outcome presented by the system, including Qualified, Conditional, or Not qualified when available.

Expiration
Where an assessment carries an expiration date, treat the displayed calendar date as the governed expiration date. Expiration does not rewrite the historical assessment.

Separation
Training completion and competency qualification are related but distinct records. Do not infer competency solely from a training completion unless the governed workflow explicitly records that competency outcome.`,
  },
  {
    sectionCode: "UM-09",
    title: "Quality events",
    changeSummary: "Initial launch operating guidance.",
    body: `Quality event workspace
Use the Quality workspace to create, review, and act on governed quality events. The event register preserves event identity and lifecycle history.

Create event
When authorized, create a quality event using the available event type, severity, description, and other required fields. Record factual information appropriate to your organization's quality procedures.

Governed actions
Lifecycle actions presented for a quality event are controlled system actions. Use the required reason, dates, evidence, and disposition fields as prompted. Do not bypass a required stage by placing the intended outcome only in free text.

Evidence
Attach supporting evidence only through governed evidence controls. A newly uploaded evidence file remains unavailable for governed selection until required scanning passes.

Closure
Close an event only after the required governed closure information and evidence are complete. Closure preserves the event record and audit trail; it is not deletion.

Corrective and preventive work
Where the application presents investigation, corrective action, preventive action, effectiveness, or related governed steps, record them in the designated workflow rather than overwriting the original event description.

Permissions
Available actions depend on the user's quality permissions and the event's current state.`,
  },
  {
    sectionCode: "UM-10",
    title: "Laboratory operations",
    changeSummary: "Initial launch operating guidance.",
    body: `Laboratory operations
The Laboratory operations module currently provides governed equipment-management functions.

Equipment register
Authorized users may register equipment with equipment number, name, manufacturer, model, serial number, received date, and applicable calibration or maintenance requirements.

Calibration and maintenance
When calibration or maintenance is required, configure the applicable interval and next due date as supported by the workspace. Due indicators are operational controls; they do not substitute for the underlying service or calibration evidence.

Qualification
Record equipment qualification through the governed event workflow and attach the required available evidence file. Qualification history is retained.

Service history
Record service provider, description, outcome, service date, and supporting evidence where applicable. Service records are audited.

Lifecycle and holds
Use the governed lifecycle controls to change equipment status. Where a compliance hold or other restriction applies, do not use the equipment merely because it remains visible in the register.

Management indicators
The equipment workspace may display counts such as active equipment, active compliance holds, calibration due within 30 days, maintenance due within 30 days, and recent service failures. These indicators support operational oversight but do not replace your organization's review procedures.`,
  },
  {
    sectionCode: "UM-11",
    title: "Reporting and analytics",
    changeSummary: "Initial launch operating guidance.",
    body: `Reporting workspace
Use Reporting & analytics to run governed reports from approved server-backed report definitions.

Report definitions
Authorized report managers may create governed report definitions only from approved sources made available by the application. A report definition controls the available data source and approved filters.

Run report
Select a governed report and available approved filters, then run the report. Execution history records the report execution and row count.

Saved views
Personal saved views preserve a user's selected report/filter preferences. A saved view is not a finalized report and does not change the underlying governed definition.

Finalization
Where permitted, a report execution may be finalized. Finalized reports are preserved separately from ordinary execution history.

Export
Where export is permitted, use the export control associated with a finalized report. Exported data must be handled according to applicable organizational procedures and data-protection requirements.

Interpretation
Counts and analytics shown by the system are derived from current governed data and configured report sources. Users remain responsible for applying appropriate organizational review and interpretation before acting on exported information.`,
  },
  {
    sectionCode: "UM-12",
    title: "Administration and configuration",
    changeSummary: "Initial launch operating guidance.",
    body: `Administration
Administration is divided into focused workspaces including Overview, Organization, Users & access, Memberships, Document configuration, Workflow templates, Notifications, and Audit trail as available to the user's permissions.

Organization
Use Organization controls to maintain governed sites and departments. Organizational configuration affects later audience, membership, and workflow behavior.

Users & access
Authorized administrators manage users, roles, permissions, and assignments. Grant only the access required for the user's responsibilities. Do not use another user's account or share credentials as a workaround for missing permissions.

Memberships
Site and department memberships are authoritative organizational assignments used by governed audience expansion. Saving memberships requires a controlled reason and creates audit evidence.

Document configuration
Configure document types and review intervals only through the designated controls. Changes affect future governed behavior and must follow organizational change-control procedures.

Workflow templates
Workflow templates are versioned and immutable once created as a version. Creating a new version defines its review stages and target days. Activation or deactivation requires the governed controls and, where prompted, a reason.

Notifications
Use notification administration to inspect delivery failures and governed recovery actions. See UM-13.

Audit trail
Use the audit-trail workspace to review recorded governed actions within the permissions provided. Audit information is evidence of system activity and must not be altered outside supported controls.`,
  },
  {
    sectionCode: "UM-13",
    title: "Notifications",
    changeSummary: "Initial launch operating guidance.",
    body: `User notifications
The QMS notification interface presents recipient-owned notifications generated by governed events. Read the notification summary and follow the linked workspace to perform any required action.

Support status notifications
When Trace acknowledges or closes a support request, the original submitting user may receive an in-app notification. The notification contains customer-facing status only and does not expose internal Trace handling details.

Delivery monitoring
Authorized administrators may inspect failed or dead-letter notification deliveries in Administration.

Overdue review notifications
Where permitted, administrators can run the governed overdue-review monitor to queue notifications for overdue review assignments.

Dead-letter recovery
A dead-letter notification may be requeued only through the provided recovery control. Requeue activity is audited.

Operational interpretation
A notification is a signal that an event occurred or attention may be required. It does not by itself grant permission, complete an approval, or alter the governed status of the underlying record.`,
  },
  {
    sectionCode: "UM-15",
    title: "Evidence handling, integrity, and prohibited content",
    changeSummary: "Initial launch operating guidance.",
    body: `Governed evidence
Evidence files support personnel, training, quality, equipment, and other governed workflows where the application provides an evidence selector.

Accepted formats
The governed evidence uploader accepts PDF, Word, Excel, JPEG, PNG, TIFF, TXT, and CSV files, subject to the displayed maximum size of 25 MB.

Malware scanning
A newly uploaded evidence file enters a pending scan state and is not selectable for governed use until the malware scan passes and the file becomes Available.

Integrity
Available evidence records include a SHA-256 integrity value. Select evidence through the governed picker rather than substituting an uncontrolled local reference.

Existing versus new evidence
Users may select an existing Available evidence file or upload a new file. Uploading a file does not automatically attach it to a record; the governed workflow must save the selected file reference.

Prohibited content
Do not upload or submit passwords, authentication secrets, or other credentials as evidence or support content. Do not place regulated data into a workflow that is not approved for that data type.

Historical evidence
Do not overwrite historical evidence to represent a renewal, correction, or later event. Where the workflow supports a new credential, completion, assessment, service record, or other evidence-bearing event, create the new governed record and preserve the prior evidence.`,
  },
  {
    sectionCode: "UM-A",
    title: "Glossary and status definitions",
    changeSummary: "Initial launch operating guidance.",
    body: `Controlled document
A document governed by the QMS lifecycle, versioning, review, approval, effectiveness, supersession, retirement, and audit controls applicable to that document.

Controlled file
A file managed by QMS integrity, scanning, quarantine, and binding controls. A controlled file is not automatically an approved or effective document.

Effective
A released controlled state that the QMS presents as currently applicable. Draft, in-review, approved-but-not-effective, superseded, and retired states are distinct where supported.

Audit evidence
System-recorded evidence of a governed action, including the acting identity and action context supported by that workflow.

Governed evidence file
A file uploaded or selected through an evidence workflow and subject to availability, integrity, and scanning controls.

Active / Inactive / Terminated personnel
Personnel lifecycle states preserved by the Personnel module. Terminated records remain historical evidence.

Training assignment
A governed requirement assigned to personnel. Assignment is not completion.

Training completion
A governed record that training activity was completed. Completion is not automatically a competency qualification.

Competency outcome
The governed result of a competency assessment, such as Qualified, Conditional, or Not qualified when supported by the configured workflow.

Quality event
A governed record used to capture and manage quality-related activity through its configured lifecycle.

Finalized report
A preserved governed report execution made final through the Reporting workflow. A personal saved view is not a finalized report.

Notification
A recipient-facing operational signal generated by a governed event. A notification does not grant access or complete the underlying governed action.

Support request
A customer Help intake record submitted to Trace. It does not grant Trace tenant access.

Controlled support case
A separate Trace control-plane case that may be created when tenant access could be required. The case itself still does not grant tenant access.

Support session
A separately approved, scoped, time-bound privileged support session created only through the controlled support-access workflow.`,
  },
] as const;
