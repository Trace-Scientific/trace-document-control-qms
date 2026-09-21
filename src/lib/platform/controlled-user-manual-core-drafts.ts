import type { ControlledUserManualSectionCode } from "./controlled-user-manual";

export type ControlledUserManualSectionDraft = {
  sectionCode: ControlledUserManualSectionCode;
  title: string;
  changeSummary: string;
  body: string;
};

export const CONTROLLED_USER_MANUAL_CORE_DRAFTS: readonly ControlledUserManualSectionDraft[] = [
  {
    sectionCode: "UM-01",
    title: "Document control and manual governance",
    changeSummary: "Initial launch operating guidance.",
    body: `Purpose
The Trace QMS Controlled User Manual provides product operating instructions for authenticated users. It explains how to use released QMS functions; it does not replace your organization's SOPs, policies, regulatory obligations, or role assignments.

Controlled status
Use the version and effective date shown by the Help Center. A draft section revision is not an effective instruction. Only a published manual release that has reached its effective date is presented to ordinary QMS users.

Applicability
Instructions apply only to functions available to your organization and permissions. If a control described here is not visible, do not attempt to bypass it; contact your tenant administrator or Trace QMS support as appropriate.

Change control
Software changes that materially alter operating instructions require a new section revision and controlled manual release. Historical releases remain preserved.`,
  },
  {
    sectionCode: "UM-02",
    title: "Access, authentication, and user responsibilities",
    changeSummary: "Initial launch operating guidance.",
    body: `Access
Use only your assigned account. Available modules and actions are determined by authenticated organization context and permissions. Do not share credentials or use another person's account.

User responsibility
Confirm that you are working in the intended organization and governed workspace before creating, approving, archiving, exporting, or otherwise changing controlled information.

Electronic approvals
Where the QMS requests an approval signature, review the exact controlled content presented and complete the required authentication confirmation. Never approve on behalf of another user.

Access problems
Use the Help Center for product guidance. For an access problem, submit a support request without including passwords, authentication secrets, patient information, controlled document content, or regulated record data.`,
  },
  {
    sectionCode: "UM-03",
    title: "Navigation and contextual Help",
    changeSummary: "Initial launch operating guidance.",
    body: `Operational workspaces
The QMS Modules area opens one governed domain at a time. Modules visible to you depend on your permissions. Available domains can include Documents, Records, Personnel, Training & competency, Quality, Laboratory operations, and Reporting & analytics.

Sub-workspaces
Within a module, use its section navigation to open one governed function at a time. This reduces the chance of acting in the wrong workflow.

Contextual Help
Select Help Center from the active QMS workspace to open guidance relevant to that module. Search results contain only published Help articles.

Controlled manual
Open the Controlled user manual tab in Help Center to view effective published releases. Select a release to view its frozen section composition, version, and effective date.`,
  },
  {
    sectionCode: "UM-04",
    title: "Document operations and controlled files",
    changeSummary: "Initial launch operating guidance.",
    body: `Document content
The Documents workspace separates Library from Files. Library is the controlled-document surface. Files is the private controlled-file surface used for uploads, integrity state, quarantine, and draft binding.

Library
Use the status filters to locate controlled documents by lifecycle state. Work only through actions made available by your permissions and the document's current state.

Controlled files
A newly uploaded file is not automatically an approved or effective controlled document. Observe integrity, scanning, quarantine, and binding status before using an uploaded file in a governed workflow.

Approval
When approval is available, verify the exact document content before completing the requested signature confirmation. The recorded approval is bound to the controlled content.

Historical integrity
Do not attempt to overwrite or reinterpret historical controlled versions. Superseded and retired states preserve prior controlled history.`,
  },
  {
    sectionCode: "UM-05",
    title: "Review queues and approval assignments",
    changeSummary: "Initial launch operating guidance.",
    body: `Review queue
The Review queue workspace separates Periodic reviews, Overdue, and—when permitted—Approval assignments.

Periodic reviews
Periodic reviews show current effective versions scheduled for review. Review due dates and status identify scheduled work.

Overdue
The Overdue view shows periodic reviews that have passed their controlled due date. An overdue indicator does not itself alter document effectiveness or authorize a user to approve a document.

Approval assignments
Authorized review managers can assign eligible final approvers after required review stages. Assignment does not substitute for the approver's own review and signature.

Permissions
If organization-wide review information or assignment controls are unavailable, your account does not have the required review-management permission.`,
  },
  {
    sectionCode: "UM-06",
    title: "Records management",
    changeSummary: "Initial launch operating guidance.",
    body: `Record management
The Records workspace separates Record library, Create record, and Record types according to permission.

Record library
Search by record number, title, type, or status. Historical identity is preserved when a record changes lifecycle state.

Create record
Authorized users create a tenant-scoped record from an active approved record type. Confirm the record type, record number, title, and occurrence date before submission.

Archive
Where permitted, archiving requires a controlled disposition reason. Archiving preserves retention and audit evidence rather than deleting historical identity.

Export
Where permitted and where an exact governed file exists, export requires a controlled reason and performs integrity verification. Treat exported files according to your organization's procedures and data-handling requirements.

Record types
Only authorized configuration users should create governed record types for future record creation.`,
  },
  {
    sectionCode: "UM-14",
    title: "Help, customer support, and controlled support access",
    changeSummary: "Initial launch operating guidance.",
    body: `Help Center
Use published Help articles for quick operational guidance and the Controlled user manual for authoritative released product instructions.

Contact support
The Contact support form accepts category, priority, subject, and description. It automatically includes only bounded diagnostic context: the current QMS workspace and browser family.

Prohibited support content
Do not include passwords, credentials, patient information, controlled document content, or other regulated record data in a support request.

My support requests
The history view shows only requests submitted by your account and their customer-visible status. Internal Trace notes, platform audit details, and controlled support-access information are not displayed.

Controlled support access
Submitting a support request does not grant Trace access to your tenant. If tenant access is genuinely required, Trace uses a separate controlled support case, scoped access request, independent approval, and time-bound support session. Customer support intake and privileged support access remain separate workflows.`,
  },
] as const;
