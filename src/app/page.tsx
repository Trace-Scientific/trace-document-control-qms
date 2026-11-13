import { DocumentControlDashboard } from "@/components/document-control-dashboard";
import { DashboardVisibilityGate } from "@/components/dashboard-visibility-gate";
import { LifecycleOperations } from "@/components/lifecycle-operations";
import { ApprovalOperations } from "@/components/approval-operations";
import { ControlledSubmission } from "@/components/controlled-submission";
import { MyAcknowledgments } from "@/components/my-acknowledgments";
import { AcknowledgmentDistribution } from "@/components/acknowledgment-distribution";
import { OrganizationalAcknowledgmentDistribution } from "@/components/organizational-acknowledgment-distribution";
import { ControlledCopyAdministration } from "@/components/controlled-copy-administration";
import { DocumentFolderManager } from "@/components/document-folder-manager";
import { RetentionAdministration } from "@/components/retention-administration";
import { RecordManagementWorkspace } from "@/components/record-management-workspace";
import { PersonnelManagementWorkspace } from "@/components/personnel-management-workspace";
import { PersonnelCredentialWorkspace } from "@/components/personnel-credential-workspace";
import { PersonnelQualificationWorkspace } from "@/components/personnel-qualification-workspace";
import { TrainingManagementWorkspace } from "@/components/training-management-workspace";
import { CompetencyManagementWorkspace } from "@/components/competency-management-workspace";
import { QualityEventWorkspace } from "@/components/quality-event-workspace";
import { EquipmentManagementWorkspace } from "@/components/equipment-management-workspace";
import { EquipmentComplianceWorkspace } from "@/components/equipment-compliance-workspace";
import { EquipmentComplianceEvidenceWorkspace } from "@/components/equipment-compliance-evidence-workspace";
import { EquipmentScheduleCorrectionWorkspace } from "@/components/equipment-schedule-correction-workspace";
import { ReportingWorkspace } from "@/components/reporting-workspace";
import { QmsModuleShell } from "@/components/qms-module-shell";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashOpaqueToken } from "@/lib/security/crypto";
import { validateSession } from "@/lib/security/session";
import { workspaceVisibility } from "@/lib/security/workspace-visibility";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const token = (await cookies()).get("qms_session")?.value;
  if (!token) redirect("/login");
  const session = await db.session.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
    include: {
      user: {
        include: {
          roles: {
            include: {
              role: {
                include: {
                  permissions: { include: { permission: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!session || !validateSession(token, session).valid || session.user.status !== "ACTIVE") redirect("/login");

  const visibility = workspaceVisibility(
    session.user.roles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.key)),
  );
  const today = new Date().toISOString().slice(0, 10);

  const documentLaunchers = (
    visibility.controlledSubmission ||
    visibility.lifecycleOperations ||
    visibility.acknowledgments ||
    visibility.acknowledgmentDistribution ||
    visibility.folderManager ||
    visibility.retentionAdministration
  ) ? (
    <section className="document-operation-launcher-panel" aria-labelledby="document-operation-launcher-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">DOCUMENT OPERATIONS</p>
          <h3 id="document-operation-launcher-heading">Document tools</h3>
          <p>Open a focused governed task without leaving the document workspace.</p>
        </div>
      </div>
      <div className="document-operation-launchers">
        {visibility.controlledSubmission && <ControlledSubmission />}
        {visibility.lifecycleOperations && <LifecycleOperations />}
        {visibility.acknowledgments && <MyAcknowledgments />}
        {visibility.acknowledgmentDistribution && <AcknowledgmentDistribution />}
        {visibility.acknowledgmentDistribution && <OrganizationalAcknowledgmentDistribution />}
        {visibility.folderManager && <DocumentFolderManager />}
        {visibility.retentionAdministration && <RetentionAdministration />}
      </div>
    </section>
  ) : null;

  const reviewManagement = visibility.approvalOperations ? (
    <section className="document-operation-launcher-panel" aria-labelledby="review-management-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">REVIEW MANAGEMENT</p>
          <h3 id="review-management-heading">Review tools</h3>
          <p>Manage approval assignments from the review domain instead of the document-operations workspace.</p>
        </div>
      </div>
      <div className="document-operation-launchers">
        <ApprovalOperations />
      </div>
    </section>
  ) : null;

  const records = visibility.recordManagement ? (
    <RecordManagementWorkspace
      canCreate={visibility.recordCreate}
      canArchive={visibility.recordArchive}
      canExport={visibility.recordExport}
      canConfigureTypes={visibility.recordTypeAdministration}
    />
  ) : null;

  const quality = visibility.qualityEventManagement ? (
    <QualityEventWorkspace canManage={visibility.qualityEventManage} today={today} />
  ) : null;

  const laboratory = visibility.equipmentManagement ? (
    <>
      <EquipmentManagementWorkspace canManage={visibility.equipmentManage} />
      {visibility.equipmentManage && <EquipmentComplianceEvidenceWorkspace today={today} />}
      {visibility.equipmentManage && <EquipmentScheduleCorrectionWorkspace />}
      <EquipmentComplianceWorkspace canManage={visibility.equipmentManage} />
    </>
  ) : null;

  const reporting = visibility.reportingManagement ? (
    <ReportingWorkspace canManage={visibility.reportingManage} canExport={visibility.reportingExport} />
  ) : null;

  return (
    <>
      {process.env.QMS_MFA_ENROLLMENT_ENABLED === "true" && (
        <nav aria-label="Account security" style={{ padding: "0.75rem 1.5rem" }}>
          <a href="/settings/security">Set up authenticator security</a>
        </nav>
      )}
      <DashboardVisibilityGate />
      <DocumentControlDashboard
        developmentPreview={process.env.DEPLOYMENT_TIER === "development-preview"}
      />
      <QmsModuleShell
        modules={[
          {
            id: "documents",
            label: "Document operations",
            description: "Submission, lifecycle, acknowledgments, copies, folders, and retention.",
            sections: [
              {
                id: "tools",
                label: "Document tools",
                description: "Submission, lifecycle, acknowledgments, folders, and retention actions.",
                content: documentLaunchers,
              },
              {
                id: "copies",
                label: "Controlled copies",
                description: "Issue and reconcile numbered controlled copies.",
                content: visibility.controlledCopies ? <ControlledCopyAdministration /> : null,
              },
            ],
          },
          {
            id: "reviews",
            label: "Review management",
            description: "Approval assignments and governed review actions.",
            content: reviewManagement,
          },
          {
            id: "records",
            label: "Records",
            description: "Governed regulated-record management.",
            content: records,
          },
          {
            id: "personnel",
            label: "Personnel",
            description: "Employees, credentials, and qualifications.",
            sections: [
              {
                id: "people",
                label: "People & assignments",
                description: "Employees, job descriptions, and job assignments.",
                content: visibility.personnelManagement ? <PersonnelManagementWorkspace canManage={visibility.personnelManage} /> : null,
              },
              {
                id: "credentials",
                label: "Credentials",
                description: "Licenses, certifications, registrations, and expiration tracking.",
                content: visibility.personnelManagement ? <PersonnelCredentialWorkspace canManage={visibility.personnelManage} today={today} /> : null,
              },
              {
                id: "qualifications",
                label: "Qualifications",
                description: "Qualification decisions and supporting evidence.",
                content: visibility.personnelManagement ? <PersonnelQualificationWorkspace canManage={visibility.personnelManage} today={today} /> : null,
              },
            ],
          },
          {
            id: "training",
            label: "Training & competency",
            description: "Training assignments and competency evidence.",
            sections: [
              {
                id: "training",
                label: "Training",
                description: "Courses, assignments, completions, and lifecycle evidence.",
                content: visibility.trainingManagement ? <TrainingManagementWorkspace canManage={visibility.trainingManage} today={today} /> : null,
              },
              {
                id: "competency",
                label: "Competency",
                description: "Programs, assessments, qualification status, and reassessment tracking.",
                content: visibility.trainingManagement ? <CompetencyManagementWorkspace canManage={visibility.trainingManage} today={today} /> : null,
              },
            ],
          },
          {
            id: "quality",
            label: "Quality",
            description: "Quality-event management and trending.",
            content: quality,
          },
          {
            id: "laboratory",
            label: "Laboratory operations",
            description: "Equipment and operational controls.",
            content: laboratory,
          },
          {
            id: "reporting",
            label: "Reporting & analytics",
            description: "Governed reporting, execution history, and exports.",
            content: reporting,
          },
        ]}
      />
    </>
  );
}
