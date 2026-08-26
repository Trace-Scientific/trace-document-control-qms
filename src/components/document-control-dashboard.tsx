"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon, type IconName } from "./icon";
import {
  filterDashboardDocuments,
  summarizeOperationalData,
} from "@/lib/documents/dashboard";
import { diffLines } from "@/lib/documents/diff";
import { reviewStageSelectionsAreValid } from "@/lib/documents/workflow-ui";

type ApiStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "APPROVED"
  | "EFFECTIVE"
  | "SUPERSEDED"
  | "RETIRED";
type Status =
  | "Draft"
  | "In review"
  | "Approved"
  | "Effective"
  | "Superseded"
  | "Retired"
  | "Review due";
type DocumentRow = {
  versionId?: string;
  id: string;
  title: string;
  type: string;
  version: string;
  status: Status;
  owner: string;
  effective: string;
  due: string;
};
type DocumentTypeOption = { id: string; code: string; name: string };
type DocumentApiRow = {
  id: string;
  documentNumber: string;
  title: string;
  type: string;
  revisionLabel: string;
  status: ApiStatus;
  owner: string;
  effectiveAt: string | null;
  reviewDueAt: string | null;
};
type DocumentPage = {
  items: DocumentApiRow[];
  nextCursor: string | null;
  types: DocumentTypeOption[];
};
type ReviewRow = {
  id: string;
  documentNumber: string;
  title: string;
  revisionLabel: string;
  dueAt: string;
  overdue: boolean;
};
type NotificationRow = {
  id: string;
  templateKey: string;
  payload: unknown;
  sentAt: string | null;
  readAt: string | null;
};
type FailureRow = {
  id: string;
  status: string;
  attempts: number;
  lastError: string | null;
  availableAt: string;
};
type DetailVersion = {
  id: string;
  documentId: string;
  documentNumber: string;
  title: string;
  type: string;
  versionNumber: number;
  revisionLabel: string;
  status: ApiStatus;
  lockVersion: number;
  owner: string;
  contentText: string | null;
  contentHash: string;
  changeSummary: string;
  effectiveAt: string | null;
  reviewDueAt: string | null;
  createdAt: string;
};
type ReviewAssignment = {
  id: string;
  stepKey: string;
  versionId: string;
  status: string;
  dueAt: string | null;
  decision: string | null;
  comments: string | null;
  assignee: { id: string; name: string } | null;
  createdAt: string;
};
type DocumentDetail = {
  selected: DetailVersion;
  versions: DetailVersion[];
  assignments: ReviewAssignment[];
  reviewers: Array<{ id: string; name: string }>;
};
type LiveData = {
  organizationId: string;
  userId: string;
  capabilities: {
    canReadDocuments: boolean;
    canCreateDocuments: boolean;
    canSubmitDocuments: boolean;
    canReviewDocuments: boolean;
    canApproveDocuments: boolean;
    canMakeDocumentsEffective: boolean;
    canManageReviews: boolean;
    canManageNotifications: boolean;
  };
  notifications: NotificationRow[];
  reviews: ReviewRow[];
  failures: FailureRow[];
};
type WorkflowTemplate = {
  id: string;
  key: string;
  version: number;
  name: string;
  active: boolean;
  stages: Array<{ name: string; dueDays: number }>;
};
type ReviewStageDraft = { reviewerUserId: string; dueAt: string };
type View = "Documents" | "Review queue" | "Administration";

const initialDocuments: DocumentRow[] = [
  {
    id: "SOP-001",
    title: "Specimen Collection and Handling",
    type: "Standard Operating Procedure",
    version: "4.2",
    status: "Effective",
    owner: "Quality Systems",
    effective: "Aug 12, 2026",
    due: "Aug 12, 2027",
  },
  {
    id: "POL-014",
    title: "Document and Record Control",
    type: "Quality Policy",
    version: "3.0",
    status: "In review",
    owner: "James Ramsey",
    effective: "—",
    due: "Aug 28, 2026",
  },
  {
    id: "WI-032",
    title: "Daily Temperature Monitoring",
    type: "Work Instruction",
    version: "2.1",
    status: "Review due",
    owner: "Laboratory Operations",
    effective: "Sep 3, 2025",
    due: "Sep 3, 2026",
  },
  {
    id: "FRM-022",
    title: "Corrective Action Investigation",
    type: "Controlled Form",
    version: "1.0",
    status: "Draft",
    owner: "Quality Systems",
    effective: "—",
    due: "—",
  },
];
const nav: { label: string; icon: IconName }[] = [
  { label: "Documents", icon: "file" },
  { label: "Review queue", icon: "review" },
  { label: "Administration", icon: "settings" },
];
const statusLabel: Record<ApiStatus, Status> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  EFFECTIVE: "Effective",
  SUPERSEDED: "Superseded",
  RETIRED: "Retired",
};
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(value))
    : "—";
function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`status status-${status.toLowerCase().replaceAll(" ", "-")}`}
    >
      <span />
      {status}
    </span>
  );
}
function payloadSummary(payload: unknown) {
  if (!payload || typeof payload !== "object")
    return "Quality system notification";
  const p = payload as Record<string, unknown>;
  return typeof p.documentId === "string"
    ? `Document ${p.documentId.slice(0, 8)} · escalation level ${String(p.level ?? 1)}`
    : "Quality system notification";
}
function mapDocument(row: DocumentApiRow): DocumentRow {
  const mappedStatus =
    row.reviewDueAt &&
    new Date(row.reviewDueAt) < new Date() &&
    row.status === "EFFECTIVE"
      ? "Review due"
      : statusLabel[row.status];
  return {
    versionId: row.id,
    id: row.documentNumber,
    title: row.title,
    type: row.type,
    version: row.revisionLabel,
    status: mappedStatus,
    owner: row.owner,
    effective: date(row.effectiveAt),
    due: date(row.reviewDueAt),
  };
}

export function DocumentControlDashboard({
  developmentPreview = false,
}: Readonly<{ developmentPreview?: boolean }>) {
  const [documents, setDocuments] = useState(initialDocuments),
    [documentTypes, setDocumentTypes] = useState<DocumentTypeOption[]>([]),
    [nextCursor, setNextCursor] = useState<string | null>(null),
    [cursor, setCursor] = useState<string | null>(null),
    [cursorHistory, setCursorHistory] = useState<Array<string | null>>([]),
    [documentsLoading, setDocumentsLoading] = useState(false),
    [documentsError, setDocumentsError] = useState("");
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [dialog, setDialog] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [mobileNav, setMobileNav] = useState(false),
    [notice, setNotice] = useState(""),
    [view, setView] = useState<View>("Documents"),
    [live, setLive] = useState<LiveData | null>(null),
    [inboxOpen, setInboxOpen] = useState(false),
    [loading, setLoading] = useState(true),
    [documentReload, setDocumentReload] = useState(0);
  const [detail, setDetail] = useState<DocumentDetail | null>(null),
    [detailLoading, setDetailLoading] = useState(false),
    [detailError, setDetailError] = useState(""),
    [compareId, setCompareId] = useState(""),
    [approvalOpen, setApprovalOpen] = useState(false),
    [revisionOpen, setRevisionOpen] = useState(false),
    [submitOpen, setSubmitOpen] = useState(false),
    [templates, setTemplates] = useState<WorkflowTemplate[]>([]),
    [templatesError, setTemplatesError] = useState(""),
    [selectedTemplateId, setSelectedTemplateId] = useState(""),
    [templateStageCount, setTemplateStageCount] = useState(2),
    [reviewStages, setReviewStages] = useState<ReviewStageDraft[]>([
      { reviewerUserId: "", dueAt: "" },
    ]);
  const visible = useMemo(
    () =>
      live
        ? documents
        : filterDashboardDocuments(
            documents,
            query,
            filter === "ALL"
              ? "All documents"
              : statusLabel[filter as ApiStatus],
          ),
    [documents, query, filter, live],
  );
  const summary = summarizeOperationalData({
      notifications: live?.notifications ?? [],
      reviews: live?.reviews ?? [],
      failures: live?.failures ?? [],
    }),
    unread = summary.unread,
    overdue = summary.overdue;

  useEffect(() => {
    let active = true;
    fetch("/api/workspace/dashboard", { credentials: "same-origin" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (active && body?.data) setLive(body.data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (view !== "Administration" || !live?.capabilities.canManageReviews)
      return;
    loadTemplates();
  }, [view, live?.capabilities.canManageReviews]);
  async function loadTemplates() {
    setTemplatesError("");
    const response = await fetch("/api/documents/workflow/templates"),
      body = await response.json().catch(() => null);
    if (response.ok) setTemplates(body.data);
    else setTemplatesError(body?.error || "Workflow templates could not be loaded.");
  }
  useEffect(() => {
    if (!live?.capabilities.canReadDocuments) return;
    const controller = new AbortController(),
      timer = setTimeout(() => {
        setDocumentsLoading(true);
        setDocumentsError("");
        const params = new URLSearchParams({ limit: "25" });
        if (query.trim()) params.set("query", query.trim());
        if (filter !== "ALL") params.set("status", filter);
        if (cursor) params.set("cursor", cursor);
        fetch(`/api/documents?${params}`, {
          credentials: "same-origin",
          signal: controller.signal,
        })
          .then(async (response) => {
            const body = await response.json();
            if (!response.ok)
              throw new Error(body.error || "Unable to load documents");
            return body.data as DocumentPage;
          })
          .then((page) => {
            setDocuments(page.items.map(mapDocument));
            setDocumentTypes(page.types);
            setNextCursor(page.nextCursor);
          })
          .catch((error) => {
            if (error instanceof Error && error.name !== "AbortError")
              setDocumentsError("Controlled documents could not be loaded.");
          })
          .finally(() => setDocumentsLoading(false));
      }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    live?.capabilities.canReadDocuments,
    query,
    filter,
    cursor,
    documentReload,
  ]);
  function resetDocumentQuery(nextQuery?: string, nextFilter?: string) {
    if (nextQuery !== undefined) setQuery(nextQuery);
    if (nextFilter !== undefined) setFilter(nextFilter);
    setCursor(null);
    setCursorHistory([]);
  }
  async function loadDetail(versionId: string) {
    if (!live) return;
    setDetailLoading(true);
    setDetailError("");
    const response = await fetch(`/api/documents/${versionId}`, {
        credentials: "same-origin",
      }),
      body = await response.json().catch(() => null);
    setDetailLoading(false);
    if (!response.ok) {
      setDetailError(body?.error || "Unable to load document detail");
      return;
    }
    setDetail(body.data);
    setCompareId(
      body.data.versions.find((row: DetailVersion) => row.id !== versionId)
        ?.id || "",
    );
  }
  async function runCommand(
    command: "SUBMIT" | "MAKE_EFFECTIVE",
    reason?: string,
  ) {
    if (!detail) return;
    setSubmitting(true);
    const response = await fetch("/api/documents/commands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "TRANSITION",
          versionId: detail.selected.id,
          command,
          expectedLockVersion: detail.selected.lockVersion,
          reason,
        }),
      }),
      body = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      setDetailError(body?.error || "The lifecycle action failed.");
      return;
    }
    await loadDetail(detail.selected.id);
    setDocumentReload((value) => value + 1);
    setNotice(
      `Document ${command.toLowerCase().replace("_", " ")} completed with audit evidence.`,
    );
  }
  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    const response = await fetch("/api/documents/commands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "UPDATE_DRAFT",
          versionId: detail.selected.id,
          expectedLockVersion: detail.selected.lockVersion,
          contentText: String(form.get("detailContent")),
          changeSummary: String(form.get("detailSummary")),
        }),
      }),
      body = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      setDetailError(body?.error || "The draft could not be saved.");
      return;
    }
    await loadDetail(detail.selected.id);
    setDocumentReload((value) => value + 1);
    setNotice("Draft changes were saved, rehashed, and audited.");
  }
  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    const response = await fetch("/api/documents/signatures/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          versionId: detail.selected.id,
          expectedLockVersion: detail.selected.lockVersion,
          password: String(form.get("password")),
          confirmed: true,
        }),
      }),
      body = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      setDetailError(body?.error || "Approval signature failed.");
      return;
    }
    setApprovalOpen(false);
    await loadDetail(detail.selected.id);
    setDocumentReload((value) => value + 1);
    setNotice(
      "Approval signature was recorded and bound to the document content.",
    );
  }
  async function createRevision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    const response = await fetch("/api/documents/commands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "CREATE_REVISION",
          sourceVersionId: detail.selected.id,
          revisionLabel: String(form.get("revisionLabel")),
          contentText: String(form.get("revisionContent")),
          changeSummary: String(form.get("revisionSummary")),
        }),
      }),
      body = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      setDetailError(
        body?.error || "The successor revision could not be created.",
      );
      return;
    }
    setRevisionOpen(false);
    setDocumentReload((value) => value + 1);
    await loadDetail(body.data.id);
    setNotice(
      "Successor revision created from the selected controlled version.",
    );
  }
  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    if (!reviewStageSelectionsAreValid(reviewStages, Boolean(selectedTemplateId))) {
      setDetailError("Review stages require unique reviewers and complete deadlines.");
      return;
    }
    const form = new FormData(event.currentTarget),
      reviewers = reviewStages.map((stage) => stage.reviewerUserId),
      comment = String(form.get("reviewComment"));
    setSubmitting(true);
    const response = await fetch("/api/documents/commands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "TRANSITION",
          versionId: detail.selected.id,
          command: "SUBMIT",
          expectedLockVersion: detail.selected.lockVersion,
          assigneeUserIds: reviewers,
          ...(selectedTemplateId
            ? { workflowTemplateId: selectedTemplateId }
            : {
                reviewStages: reviewStages.map((stage) => ({
                  reviewerUserId: stage.reviewerUserId,
                  dueAt: new Date(`${stage.dueAt}T23:59:59`).toISOString(),
                })),
              }),
          comment,
        }),
      }),
      body = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      setDetailError(
        body?.error || "The review assignment could not be created.",
      );
      return;
    }
    setSubmitOpen(false);
    setSelectedTemplateId("");
    setReviewStages([{ reviewerUserId: "", dueAt: "" }]);
    await loadDetail(detail.selected.id);
    setDocumentReload((value) => value + 1);
    setNotice(
      "Revision submitted to the ordered reviewers with an audited due date.",
    );
  }
  async function transferReview(
    taskId: string,
    mode: "REASSIGN" | "DELEGATE",
    selectedReviewerId?: string,
  ) {
    if (!detail) return;
    const newAssigneeUserId = selectedReviewerId,
      reason = newAssigneeUserId
        ? window.prompt("Enter the required reason for this transfer")
        : null;
    if (!newAssigneeUserId?.trim() || !reason?.trim()) return;
    setSubmitting(true);
    const response = await fetch("/api/documents/workflow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: mode, taskId, newAssigneeUserId, reason }),
      }),
      body = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      setDetailError(body?.error || "The reviewer transfer could not be completed.");
      return;
    }
    await loadDetail(detail.selected.id);
    setNotice(mode === "DELEGATE" ? "Review stage delegated and audited." : "Review stage reassigned and audited.");
  }
  async function createWorkflowTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      stageNames = form.getAll("templateStageName").map(String),
      dueDays = form.getAll("templateDueDays").map(Number);
    setSubmitting(true);
    const response = await fetch("/api/documents/workflow/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "CREATE_VERSION",
          key: String(form.get("templateKey")),
          name: String(form.get("templateName")),
          stages: stageNames.map((name, index) => ({ name, dueDays: dueDays[index] })),
        }),
      }),
      body = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      setTemplatesError(body?.error || "The workflow template could not be created.");
      return;
    }
    event.currentTarget.reset();
    await loadTemplates();
    setNotice("A new immutable workflow-template version was activated.");
  }
  async function setTemplateActive(template: WorkflowTemplate, active: boolean) {
    const reason = window.prompt(active ? "Reason for activation" : "Reason for deactivation");
    if (!reason?.trim()) return;
    setSubmitting(true);
    const response = await fetch("/api/documents/workflow/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "SET_ACTIVE", templateId: template.id, active, reason }),
    });
    setSubmitting(false);
    if (response.ok) {
      await loadTemplates();
      setNotice(`Workflow template ${active ? "activated" : "deactivated"}.`);
    } else setTemplatesError("The workflow-template state could not be changed.");
  }
  async function decideReview(
    taskId: string,
    decision: "ACCEPT" | "REQUEST_CHANGES",
  ) {
    if (!detail) return;
    const comment = window.prompt(
      decision === "ACCEPT"
        ? "Enter your review comment"
        : "Describe the required changes",
    );
    if (!comment?.trim()) return;
    setSubmitting(true);
    const response = await fetch("/api/documents/workflow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "DECIDE",
          taskId,
          decision,
          comment,
        }),
      }),
      body = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      setDetailError(
        body?.error || "The review decision could not be recorded.",
      );
      return;
    }
    await loadDetail(detail.selected.id);
    setDocumentReload((value) => value + 1);
    setNotice(
      decision === "ACCEPT"
        ? "Review stage accepted; the next stage is now active."
        : "Revision returned to draft with the reviewer comment.",
    );
  }
  async function monitorWorkflowOverdue() {
    setSubmitting(true);
    const response = await fetch("/api/documents/workflow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "MONITOR_OVERDUE" }),
      }),
      body = await response.json().catch(() => null);
    setSubmitting(false);
    setNotice(
      response.ok
        ? `${body.data.created} overdue review notification${body.data.created === 1 ? "" : "s"} queued.`
        : body?.error || "Unable to monitor overdue assignments.",
    );
  }
  async function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!live?.capabilities.canCreateDocuments) return;
    setSubmitting(true);
    setNotice("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/documents/commands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "CREATE_DRAFT",
        documentTypeId: String(form.get("type")),
        documentNumber: String(form.get("number")),
        title: String(form.get("title")),
        versionNumber: 1,
        revisionLabel: "0.1",
        contentText: String(form.get("content")),
        changeSummary: String(form.get("summary")),
      }),
    });
    const body = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      setNotice(body?.error || "The draft could not be created.");
      return;
    }
    setDialog(false);
    resetDocumentQuery("", "ALL");
    setDocumentReload((value) => value + 1);
    setNotice(
      `${String(form.get("number"))} was saved as controlled draft version 0.1.`,
    );
  }
  async function markRead(item: NotificationRow) {
    if (!live || item.readAt) return;
    const response = await fetch("/api/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "READ",
        organizationId: live.organizationId,
        notificationId: item.id,
      }),
    });
    if (response.ok)
      setLive({
        ...live,
        notifications: live.notifications.map((row) =>
          row.id === item.id
            ? { ...row, readAt: new Date().toISOString() }
            : row,
        ),
      });
  }
  async function requeue(item: FailureRow) {
    if (!live) return;
    const response = await fetch("/api/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "REQUEUE",
        organizationId: live.organizationId,
        notificationId: item.id,
      }),
    });
    if (response.ok) {
      setLive({
        ...live,
        failures: live.failures.filter((row) => row.id !== item.id),
      });
      setNotice(
        "Dead-letter notification was requeued and the action was audited.",
      );
    }
  }
  const comparison = detail?.versions.find((row) => row.id === compareId);
  const redline =
    detail && comparison
      ? diffLines(
          comparison.contentText ?? "",
          detail.selected.contentText ?? "",
        )
      : [];
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <Icon name="shield" />
          </div>
          <div>
            <strong>TRACE</strong>
            <span>QUALITY SYSTEMS</span>
          </div>
        </div>
        <button
          className="sidebar-close"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        >
          <Icon name="close" />
        </button>
        <div className="workspace">
          <span>WORKSPACE</span>
          <button>
            Trace Scientific
            <Icon name="chevron" />
          </button>
        </div>
        <nav aria-label="Primary navigation">
          {nav.map((item) => (
            <button
              key={item.label}
              className={view === item.label ? "active" : ""}
              onClick={() => {
                setView(item.label as View);
                setMobileNav(false);
              }}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.label === "Review queue" && overdue > 0 && <b>{overdue}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="compliance">
            <Icon name="shield" />
            <div>
              <strong>Audit controls active</strong>
              <span>Evidence is append-only</span>
            </div>
          </div>
          <div className="user-card">
            <div className="avatar">JR</div>
            <div>
              <strong>James Ramsey</strong>
              <span>Quality Administrator</span>
            </div>
            <Icon name="more" />
          </div>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobileNav(true)}
          >
            <Icon name="menu" />
          </button>
          <div className="global-search">
            <Icon name="search" />
            <input
              aria-label="Global search"
              placeholder="Search QMS records"
            />
            <kbd>⌘ K</kbd>
          </div>
          <button
            className="icon-button"
            aria-label={`${unread} unread notifications`}
            aria-expanded={inboxOpen}
            onClick={() => setInboxOpen(!inboxOpen)}
          >
            <Icon name="bell" />
            {unread > 0 && <span className="notification-count">{unread}</span>}
          </button>
          <div className="top-avatar">JR</div>
        </header>
        {inboxOpen && (
          <aside className="notification-drawer" aria-label="Notifications">
            <div className="drawer-head">
              <div>
                <h2>Notifications</h2>
                <p>{unread} unread</p>
              </div>
              <button
                aria-label="Close notifications"
                onClick={() => setInboxOpen(false)}
              >
                <Icon name="close" />
              </button>
            </div>
            {live?.notifications.length ? (
              live.notifications.map((item) => (
                <button
                  key={item.id}
                  className={`notification-item ${item.readAt ? "" : "unread"}`}
                  onClick={() => markRead(item)}
                >
                  <span className="activity-dot amber">
                    <Icon name="clock" />
                  </span>
                  <span>
                    <strong>{item.templateKey.replaceAll("_", " ")}</strong>
                    <small>{payloadSummary(item.payload)}</small>
                    <time>{date(item.sentAt)}</time>
                  </span>
                </button>
              ))
            ) : (
              <div className="drawer-empty">
                <Icon name="bell" />
                <strong>No notifications</strong>
                <span>
                  {loading ? "Loading your inbox…" : "You are all caught up."}
                </span>
              </div>
            )}
          </aside>
        )}
        <main className="workspace-main">
          {developmentPreview && (
            <div className="environment-warning" role="status">
              DEVELOPMENT PREVIEW — SYNTHETIC DATA ONLY — NOT VALIDATED FOR
              REGULATED USE
            </div>
          )}
          <div className="preview-banner">
            <span>
              {live ? "AUTHENTICATED WORKSPACE" : "VALIDATION WORKSPACE"}
            </span>
            {live
              ? "Live tenant-scoped documents, reviews, and notifications"
              : "Demonstration records only — sign in to load live records"}
          </div>
          <div className="page-heading">
            <div>
              <p className="eyebrow">POLICY &amp; DOCUMENTATION</p>
              <h1>{view}</h1>
              <p>
                {view === "Documents"
                  ? "Manage controlled content, approvals, effective versions, and review schedules."
                  : view === "Review queue"
                    ? "Monitor current-version periodic reviews and overdue work."
                    : "Monitor notification delivery failures and controlled recovery."}
              </p>
            </div>
            {view === "Documents" && (
              <button
                className="primary-button"
                disabled={
                  live !== null && !live.capabilities.canCreateDocuments
                }
                onClick={() => setDialog(true)}
              >
                <Icon name="plus" />
                New document
              </button>
            )}
          </div>
          {notice && (
            <div className="notice" role="status">
              <Icon name="check" />
              <span>{notice}</span>
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <Icon name="close" />
              </button>
            </div>
          )}
          <section className="metric-grid" aria-label="Workspace summary">
            <article>
              <span className="metric-icon blue">
                <Icon name="file" />
              </span>
              <div>
                <span>{live ? "PAGE RESULTS" : "CONTROLLED DOCUMENTS"}</span>
                <strong>{live ? documents.length : 128}</strong>
                <small>
                  {live ? "Tenant-scoped query" : "Validation dataset"}
                </small>
              </div>
            </article>
            <article>
              <span className="metric-icon amber">
                <Icon name="review" />
              </span>
              <div>
                <span>OPEN REVIEWS</span>
                <strong>{live?.reviews.length ?? 4}</strong>
                <small>{overdue} overdue</small>
              </div>
            </article>
            <article>
              <span className="metric-icon violet">
                <Icon name="bell" />
              </span>
              <div>
                <span>UNREAD NOTIFICATIONS</span>
                <strong>{unread}</strong>
                <small>Recipient-owned inbox</small>
              </div>
            </article>
            <article>
              <span className="metric-icon green">
                <Icon name="check" />
              </span>
              <div>
                <span>DELIVERY FAILURES</span>
                <strong>{live?.failures.length ?? 0}</strong>
                <small>Administrator visibility</small>
              </div>
            </article>
          </section>
          {view === "Documents" && (
            <section className="panel documents-panel">
              <div className="panel-header">
                <div>
                  <h2>Controlled documents</h2>
                  <p>
                    {live
                      ? "Tenant-scoped current and in-process versions"
                      : "Demonstration current and in-process versions"}
                  </p>
                </div>
              </div>
              <div className="toolbar">
                <div className="table-search">
                  <Icon name="search" />
                  <input
                    value={query}
                    onChange={(e) =>
                      resetDocumentQuery(e.target.value, undefined)
                    }
                    placeholder="Search title, number, or type"
                    aria-label="Search documents"
                  />
                </div>
                <select
                  value={filter}
                  onChange={(e) =>
                    resetDocumentQuery(undefined, e.target.value)
                  }
                  aria-label="Filter by status"
                >
                  <option value="ALL">All documents</option>
                  <option value="EFFECTIVE">Effective</option>
                  <option value="IN_REVIEW">In review</option>
                  <option value="APPROVED">Approved</option>
                  <option value="DRAFT">Draft</option>
                  <option value="SUPERSEDED">Superseded</option>
                  <option value="RETIRED">Retired</option>
                </select>
              </div>
              {documentsError && (
                <div className="permission-state">
                  <Icon name="shield" />
                  <strong>Documents unavailable</strong>
                  <span>{documentsError}</span>
                </div>
              )}
              {live && !live.capabilities.canReadDocuments ? (
                <div className="permission-state">
                  <Icon name="shield" />
                  <strong>Document access required</strong>
                  <span>
                    Your account cannot view controlled document versions.
                  </span>
                </div>
              ) : (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Document</th>
                          <th>Status</th>
                          <th>Version</th>
                          <th>Owner</th>
                          <th>Effective</th>
                          <th>Review due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((document) => (
                          <tr key={`${document.id}-${document.version}`}>
                            <td>
                              <button
                                className="document-link"
                                disabled={!document.versionId}
                                onClick={() =>
                                  document.versionId &&
                                  loadDetail(document.versionId)
                                }
                              >
                                {document.title}
                              </button>
                              <span>
                                {document.id} · {document.type}
                              </span>
                            </td>
                            <td>
                              <StatusBadge status={document.status} />
                            </td>
                            <td>v{document.version}</td>
                            <td>{document.owner}</td>
                            <td>{document.effective}</td>
                            <td
                              className={
                                document.status === "Review due" ? "due" : ""
                              }
                            >
                              {document.due}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!documentsLoading && !visible.length && (
                      <div className="empty-state">
                        <Icon name="file" />
                        <strong>No documents found</strong>
                        <span>Adjust the search or status filter.</span>
                      </div>
                    )}
                  </div>
                  {live && (
                    <div className="table-footer">
                      <span>
                        {documentsLoading
                          ? "Loading controlled documents…"
                          : `${documents.length} result${documents.length === 1 ? "" : "s"} on this page`}
                      </span>
                      <div>
                        <button
                          disabled={!cursor || documentsLoading}
                          onClick={() => {
                            const history = [...cursorHistory];
                            setCursor(history.pop() ?? null);
                            setCursorHistory(history);
                          }}
                        >
                          Previous
                        </button>
                        <button
                          disabled={!nextCursor || documentsLoading}
                          onClick={() => {
                            setCursorHistory((history) => [...history, cursor]);
                            setCursor(nextCursor);
                          }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
          {view === "Review queue" && (
            <section className="panel documents-panel">
              <div className="panel-header">
                <div>
                  <h2>Periodic review queue</h2>
                  <p>Only current effective versions are shown</p>
                </div>
                <span className="count-pill">{live?.reviews.length ?? 0}</span>
              </div>
              {live?.capabilities.canManageReviews ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Document</th>
                        <th>Version</th>
                        <th>Review due</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {live.reviews.map((review) => (
                        <tr key={review.id}>
                          <td>
                            <a href="#">{review.title}</a>
                            <span>{review.documentNumber}</span>
                          </td>
                          <td>v{review.revisionLabel}</td>
                          <td className={review.overdue ? "due" : ""}>
                            {date(review.dueAt)}
                          </td>
                          <td>
                            <span
                              className={`status ${review.overdue ? "status-review-due" : "status-effective"}`}
                            >
                              <span />
                              {review.overdue ? "Overdue" : "Scheduled"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!live.reviews.length && (
                    <div className="empty-state">
                      <Icon name="check" />
                      <strong>No outstanding reviews</strong>
                      <span>
                        All current effective versions are within schedule.
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="permission-state">
                  <Icon name="shield" />
                  <strong>Review management access required</strong>
                  <span>
                    Your account cannot view the organization-wide periodic
                    review queue.
                  </span>
                </div>
              )}
            </section>
          )}
          {view === "Administration" && (
            <div className="admin-stack">
            {live?.capabilities.canManageReviews && (
              <section className="panel documents-panel">
                <div className="panel-header">
                  <div><h2>Review workflow templates</h2><p>Immutable, versioned stage definitions</p></div>
                  <span className="count-pill">{templates.length}</span>
                </div>
                {templatesError && <div className="detail-error" role="alert">{templatesError}</div>}
                <div className="template-layout">
                  <div className="template-list">
                    {templates.map((template) => (
                      <article key={template.id}>
                        <div><strong>{template.name}</strong><span>{template.key} · v{template.version}</span></div>
                        <ol>{template.stages.map((stage) => <li key={`${stage.name}-${stage.dueDays}`}>{stage.name} <span>{stage.dueDays} day target</span></li>)}</ol>
                        <button className="text-button" disabled={submitting} onClick={() => setTemplateActive(template, !template.active)}>
                          {template.active ? "Deactivate" : "Activate"}
                        </button>
                      </article>
                    ))}
                    {!templates.length && <div className="empty-state"><Icon name="review" /><strong>No workflow templates</strong><span>Create the first reusable review path.</span></div>}
                  </div>
                  <form className="template-form" onSubmit={createWorkflowTemplate}>
                    <strong>Create template version</strong>
                    <label>Template key<input name="templateKey" required pattern="[a-z][a-z0-9_-]{1,49}" placeholder="document-approval" /></label>
                    <label>Display name<input name="templateName" required maxLength={100} /></label>
                    {Array.from({ length: templateStageCount }, (_, index) => index + 1).map((stage) => <div className="template-stage" key={stage}>
                      <label>Stage {stage}<input name="templateStageName" required placeholder={stage === 1 ? "Quality review" : "Operations review"} /></label>
                      <label>Target days<input name="templateDueDays" type="number" min={1} max={365} required /></label>
                    </div>)}
                    <div className="template-stage-actions">
                      <button type="button" disabled={templateStageCount >= 10} onClick={() => setTemplateStageCount((count) => count + 1)}>Add stage</button>
                      <button type="button" disabled={templateStageCount <= 1} onClick={() => setTemplateStageCount((count) => count - 1)}>Remove last</button>
                    </div>
                    <button className="primary-button" disabled={submitting} type="submit">Create and activate</button>
                  </form>
                </div>
              </section>
            )}
            <section className="panel documents-panel">
              <div className="panel-header">
                <div>
                  <h2>Notification delivery monitoring</h2>
                  <p>Failed and dead-letter deliveries only</p>
                </div>
                <div>
                  <span className="count-pill">
                    {live?.failures.length ?? 0}
                  </span>
                  {live?.capabilities.canManageReviews && (
                    <button
                      className="text-button"
                      disabled={submitting}
                      onClick={monitorWorkflowOverdue}
                    >
                      Queue overdue reviews
                    </button>
                  )}
                </div>
              </div>
              {live?.capabilities.canManageNotifications ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Attempts</th>
                        <th>Next attempt</th>
                        <th>Last error</th>
                        <th>Recovery</th>
                      </tr>
                    </thead>
                    <tbody>
                      {live.failures.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <span className="status status-review-due">
                              <span />
                              {item.status.replace("_", " ")}
                            </span>
                          </td>
                          <td>{item.attempts}</td>
                          <td>{date(item.availableAt)}</td>
                          <td className="error-cell">
                            {item.lastError ?? "—"}
                          </td>
                          <td>
                            <button
                              className="text-button"
                              disabled={item.status !== "DEAD_LETTER"}
                              onClick={() => requeue(item)}
                            >
                              Requeue
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!live.failures.length && (
                    <div className="empty-state">
                      <Icon name="check" />
                      <strong>Delivery queue healthy</strong>
                      <span>No failed or dead-letter notifications.</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="permission-state">
                  <Icon name="shield" />
                  <strong>Administrator access required</strong>
                  <span>Your account cannot view delivery diagnostics.</span>
                </div>
              )}
            </section>
            </div>
          )}
        </main>
      </div>
      {detail && (
        <div className="modal-backdrop detail-backdrop" role="presentation">
          <div
            className="modal detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
          >
            <div className="modal-head">
              <div>
                <span className="modal-icon">
                  <Icon name="file" />
                </span>
                <div>
                  <h2 id="detail-title">{detail.selected.title}</h2>
                  <p>
                    {detail.selected.documentNumber} · {detail.selected.type} ·
                    Version {detail.selected.revisionLabel}
                  </p>
                </div>
              </div>
              <button
                aria-label="Close document detail"
                onClick={() => {
                  setDetail(null);
                  setApprovalOpen(false);
                  setRevisionOpen(false);
                  setSubmitOpen(false);
                  setDetailError("");
                }}
              >
                <Icon name="close" />
              </button>
            </div>
            <div className="detail-body">
              {detailError && (
                <div className="detail-error" role="alert">
                  {detailError}
                </div>
              )}
              <div className="detail-meta">
                <StatusBadge status={statusLabel[detail.selected.status]} />
                <span>Owner: {detail.selected.owner}</span>
                <span>Lock: {detail.selected.lockVersion}</span>
                <span>
                  SHA-256: {detail.selected.contentHash.slice(0, 12)}…
                </span>
              </div>
              {detail.selected.status === "DRAFT" &&
              live?.capabilities.canCreateDocuments ? (
                <form
                  className="detail-edit"
                  key={`${detail.selected.id}-${detail.selected.lockVersion}`}
                  onSubmit={saveDraft}
                >
                  <label>
                    Controlled content
                    <textarea
                      name="detailContent"
                      required
                      maxLength={1000000}
                      defaultValue={detail.selected.contentText ?? ""}
                    />
                  </label>
                  <label>
                    Change summary
                    <textarea
                      name="detailSummary"
                      required
                      maxLength={4000}
                      defaultValue={detail.selected.changeSummary}
                    />
                  </label>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={submitting}
                  >
                    {submitting ? "Saving…" : "Save audited draft"}
                  </button>
                </form>
              ) : (
                <section className="content-card">
                  <h3>Controlled content</h3>
                  <pre>
                    {detail.selected.contentText ||
                      "No text content is stored for this legacy version."}
                  </pre>
                  <small>{detail.selected.changeSummary}</small>
                </section>
              )}
              <section className="comparison">
                <div className="comparison-head">
                  <div>
                    <h3>Version comparison</h3>
                    <p>Compare stored content and change evidence.</p>
                  </div>
                  <select
                    aria-label="Comparison version"
                    value={compareId}
                    onChange={(event) => setCompareId(event.target.value)}
                  >
                    <option value="">Select a version</option>
                    {detail.versions
                      .filter((row) => row.id !== detail.selected.id)
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          v{row.revisionLabel} · {statusLabel[row.status]}
                        </option>
                      ))}
                  </select>
                </div>
                {comparison ? (
                  <div className="redline-card">
                    <div className="redline-legend">
                      <span className="diff-added">Added</span>
                      <span className="diff-removed">Removed</span>
                      <span>Unchanged</span>
                    </div>
                    <pre>
                      {redline.map((line, index) => (
                        <span
                          className={`diff-${line.kind}`}
                          key={`${index}-${line.text}`}
                        >
                          {line.kind === "added"
                            ? "+ "
                            : line.kind === "removed"
                              ? "- "
                              : "  "}
                          {line.text}
                          {"\n"}
                        </span>
                      ))}
                    </pre>
                    <small>
                      Comparing v{comparison.revisionLabel} to v
                      {detail.selected.revisionLabel} ·{" "}
                      {comparison.changeSummary}
                    </small>
                  </div>
                ) : (
                  <div className="comparison-empty">
                    No earlier version is available for comparison.
                  </div>
                )}
              </section>
              <section className="assignment-history">
                <h3>Revision review history</h3>
                {detail.assignments
                  .filter((item) => item.versionId === detail.selected.id)
                  .map((item) => (
                    <article key={item.id}>
                      <div>
                        <strong>
                          {item.assignee?.name || "Unassigned review"}
                        </strong>
                        <span>
                          {item.status.replaceAll("_", " ")} · Due{" "}
                          {date(item.dueAt)}
                        </span>
                      </div>
                      <p>
                        {item.comments ||
                          item.decision ||
                          "No reviewer comment recorded."}
                      </p>
                      {item.status === "IN_PROGRESS" &&
                        item.assignee?.id === live?.userId && (
                          <div className="review-decisions">
                            <select
                              aria-label="Delegate this stage"
                              defaultValue=""
                              disabled={submitting}
                              onChange={(event) => {
                                if (event.target.value)
                                  transferReview(item.id, "DELEGATE", event.target.value);
                                event.target.value = "";
                              }}
                            >
                              <option value="">Delegate…</option>
                              {detail.reviewers.filter((reviewer) => reviewer.id !== live?.userId).map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.name}</option>)}
                            </select>
                            <button
                              disabled={submitting}
                              onClick={() =>
                                decideReview(item.id, "REQUEST_CHANGES")
                              }
                            >
                              Request changes
                            </button>
                            <button
                              className="primary-button"
                              disabled={submitting}
                              onClick={() => decideReview(item.id, "ACCEPT")}
                            >
                              Accept stage
                            </button>
                          </div>
                        )}
                      {["PENDING", "IN_PROGRESS"].includes(item.status) &&
                        item.stepKey.startsWith("REVIEW_") &&
                        live?.capabilities.canManageReviews && (
                          <select
                            aria-label="Reassign reviewer"
                            defaultValue=""
                            disabled={submitting}
                            onChange={(event) => {
                              if (event.target.value)
                                transferReview(item.id, "REASSIGN", event.target.value);
                              event.target.value = "";
                            }}
                          >
                            <option value="">Reassign…</option>
                            {detail.reviewers.filter((reviewer) => reviewer.id !== item.assignee?.id).map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.name}</option>)}
                          </select>
                        )}
                    </article>
                  ))}
                {!detail.assignments.some(
                  (item) => item.versionId === detail.selected.id,
                ) && (
                  <div className="comparison-empty">
                    No review assignment exists for this revision.
                  </div>
                )}
              </section>
              <div className="detail-actions">
                <span>
                  Only actions valid for this state and your permissions are
                  available.
                </span>
                <div>
                  {detail.selected.status === "DRAFT" &&
                    live?.capabilities.canSubmitDocuments && (
                      <button
                        disabled={submitting}
                        onClick={() => setSubmitOpen(true)}
                      >
                        Submit for review
                      </button>
                    )}
                  {["EFFECTIVE", "SUPERSEDED"].includes(
                    detail.selected.status,
                  ) &&
                    live?.capabilities.canCreateDocuments && (
                      <button
                        disabled={submitting}
                        onClick={() => setRevisionOpen(true)}
                      >
                        Create successor revision
                      </button>
                    )}
                  {detail.selected.status === "IN_REVIEW" &&
                    detail.assignments.some(
                      (item) =>
                        item.versionId === detail.selected.id &&
                        item.stepKey === "APPROVAL" &&
                        ["PENDING", "IN_PROGRESS"].includes(item.status),
                    ) &&
                    live?.capabilities.canApproveDocuments && (
                      <button
                        className="primary-button"
                        disabled={submitting}
                        onClick={() => setApprovalOpen(true)}
                      >
                        Approve with signature
                      </button>
                    )}
                  {detail.selected.status === "APPROVED" &&
                    live?.capabilities.canMakeDocumentsEffective && (
                      <button
                        className="primary-button"
                        disabled={submitting}
                        onClick={() => runCommand("MAKE_EFFECTIVE")}
                      >
                        Make effective
                      </button>
                    )}
                </div>
              </div>
              {submitOpen && (
                <form className="approval-box" onSubmit={submitReview}>
                  <strong>Assign revision review</strong>
                  <p>
                    Build ordered stages with individual deadlines or apply an
                    active reusable template.
                  </p>
                  <label>
                    Workflow template (optional)
                    <select value={selectedTemplateId} onChange={(event) => {
                      const id = event.target.value;
                      setSelectedTemplateId(id);
                      const template = templates.find((item) => item.id === id);
                      if (template) setReviewStages(template.stages.map(() => ({ reviewerUserId: "", dueAt: "" })));
                    }}>
                      <option value="">Custom stage deadlines</option>
                      {templates.filter((item) => item.active).map((template) => <option key={template.id} value={template.id}>{template.name} · v{template.version}</option>)}
                    </select>
                  </label>
                  <div className="stage-builder">
                    {reviewStages.map((stage, index) => (
                      <div className="stage-row" key={index}>
                        <span>{index + 1}</span>
                        <label>Reviewer<select required value={stage.reviewerUserId} onChange={(event) => setReviewStages((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, reviewerUserId: event.target.value } : item))}>
                          <option value="">Select reviewer</option>
                          {detail.reviewers.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.name}</option>)}
                        </select></label>
                        {!selectedTemplateId && <label>Due date<input required type="date" value={stage.dueAt} onChange={(event) => setReviewStages((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, dueAt: event.target.value } : item))} /></label>}
                        {!selectedTemplateId && reviewStages.length > 1 && <button type="button" aria-label={`Remove stage ${index + 1}`} onClick={() => setReviewStages((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>}
                      </div>
                    ))}
                    {!selectedTemplateId && reviewStages.length < 10 && <button type="button" className="text-button" onClick={() => setReviewStages((items) => [...items, { reviewerUserId: "", dueAt: "" }])}>Add review stage</button>}
                  </div>
                  <label>
                    Review comment
                    <textarea name="reviewComment" required maxLength={4000} />
                  </label>
                  <div>
                    <button type="button" onClick={() => setSubmitOpen(false)}>
                      Cancel
                    </button>
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={
                        submitting ||
                        !detail.reviewers.length ||
                        !reviewStageSelectionsAreValid(
                          reviewStages,
                          Boolean(selectedTemplateId),
                        )
                      }
                    >
                      {submitting ? "Submitting…" : "Assign stages and submit"}
                    </button>
                  </div>
                </form>
              )}
              {revisionOpen && (
                <form className="approval-box" onSubmit={createRevision}>
                  <strong>Create successor revision</strong>
                  <p>
                    The new draft is linked to this source version and receives
                    the next internal version number.
                  </p>
                  <label>
                    Revision label
                    <input
                      name="revisionLabel"
                      required
                      maxLength={50}
                      placeholder="2.0"
                    />
                  </label>
                  <label>
                    Controlled content
                    <textarea
                      name="revisionContent"
                      required
                      maxLength={1000000}
                      defaultValue={detail.selected.contentText ?? ""}
                    />
                  </label>
                  <label>
                    Change summary
                    <textarea
                      name="revisionSummary"
                      required
                      maxLength={4000}
                    />
                  </label>
                  <div>
                    <button
                      type="button"
                      onClick={() => setRevisionOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={submitting}
                    >
                      {submitting ? "Creating…" : "Create successor"}
                    </button>
                  </div>
                </form>
              )}
              {approvalOpen && (
                <form className="approval-box" onSubmit={approve}>
                  <strong>Electronic approval signature</strong>
                  <p>
                    Re-enter your password and confirm that you approve this
                    exact document content.
                  </p>
                  <label>
                    Password
                    <input
                      name="password"
                      type="password"
                      required
                      maxLength={1024}
                      autoComplete="current-password"
                      autoFocus
                    />
                  </label>
                  <div>
                    <button
                      type="button"
                      onClick={() => setApprovalOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={submitting}
                    >
                      {submitting ? "Signing…" : "Confirm approval"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
      {detailLoading && !detail && (
        <div className="loading-toast" role="status">
          Loading controlled document…
        </div>
      )}
      {dialog && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => e.target === e.currentTarget && setDialog(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-title"
          >
            <div className="modal-head">
              <div>
                <span className="modal-icon">
                  <Icon name="file" />
                </span>
                <div>
                  <h2 id="new-title">Create controlled document</h2>
                  <p>Start a new document at draft version 0.1.</p>
                </div>
              </div>
              <button
                aria-label="Close dialog"
                onClick={() => setDialog(false)}
              >
                <Icon name="close" />
              </button>
            </div>
            {live?.capabilities.canCreateDocuments ? (
              <form onSubmit={createDraft}>
                <label>
                  Document title
                  <input name="title" required maxLength={500} autoFocus />
                </label>
                <div className="form-row">
                  <label>
                    Document number
                    <input
                      name="number"
                      required
                      maxLength={100}
                      placeholder="SOP-000"
                    />
                  </label>
                  <label>
                    Document type
                    <select name="type" required>
                      {documentTypes.map((type) => (
                        <option value={type.id} key={type.id}>
                          {type.code} · {type.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Initial document content
                  <textarea name="content" required maxLength={1000000} />
                </label>
                <label>
                  Change summary
                  <textarea name="summary" required maxLength={4000} />
                </label>
                <div className="form-note">
                  <Icon name="shield" />
                  <span>
                    The server derives the tenant and author from the session,
                    hashes the content, and writes the draft with audit
                    evidence.
                  </span>
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={() => setDialog(false)}>
                    Cancel
                  </button>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={submitting || !documentTypes.length}
                  >
                    {submitting ? "Creating…" : "Create draft"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="permission-state">
                <Icon name="shield" />
                <strong>Authenticated creation access required</strong>
                <span>
                  Sign in with document creation permission to start a
                  controlled draft.
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
