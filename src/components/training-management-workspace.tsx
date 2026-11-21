"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { GovernedEvidenceFilePicker } from "./governed-evidence-file-picker";
import { DemoTrainingLesson } from "./demo-training-lesson";

type Employee = { id: string; employeeNumber: string; firstName: string; lastName: string; status: "ACTIVE" | "INACTIVE" | "TERMINATED" };
type Course = { id: string; code: string; title: string; active: boolean };
type Assignment = { id: string; employeeId: string; courseId: string; assignedAt: string; dueAt: string | null; status: "ASSIGNED" | "COMPLETED" | "CANCELLED"; cancelReason?: string | null };
type LearnerCourseContent = { publicationId: string; version: number; lessons: { heading: string; content: string }[]; assessment: { passingScorePercent: number; questions: { prompt: string; choices: string[] }[] } };
type ReviewContent = { lessons: { heading: string; content: string }[]; assessment: { passingScorePercent: number; questions: { prompt: string; choices: string[]; correctIndex: number; explanation: string }[] } };
type CourseReview = { id: string; courseId: string; draftRevision: number; status: string; submittedAt: string; submittedByUserId?: string };
type CoursePublication = { id: string; courseId: string; version: number; publishedAt: string };
type Completion = { id: string; assignmentId: string; employeeId: string; courseId: string; completedAt: string; result: string | null; fileId: string | null; evidenceName?: string | null; evidenceStatus?: string | null };
const courseCategories = ["All categories", "Safety & OSHA", "HIPAA & Compliance", "Quality Management", "Laboratory Operations", "Clinical Disciplines", "Leadership & Personnel", "Uncategorized"] as const;
type CourseCategory = (typeof courseCategories)[number];

function courseCategory(course: Course): CourseCategory {
  // Classification is only for the two explicitly authored demo courses; do not infer regulated categories from titles.
  if (course.code === "DEMO-HIPAA") return "HIPAA & Compliance";
  if (course.code === "DEMO-BBP") return "Safety & OSHA";
  return "Uncategorized";
}

type Section = "assignments" | "assign" | "complete" | "history" | "lifecycle" | "courses";

function formatDateOnly(value: string | null) {
  if (!value) return "—";
  const calendar = value.slice(0, 10);
  const [year, month, day] = calendar.split("-").map(Number);
  if (!year || !month || !day) return calendar;
  return `${month}/${day}/${year}`;
}

function localDateTimeInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function dateOnlyTime(value: string | null) {
  if (!value) return null;
  const calendar = value.slice(0, 10);
  const [year, month, day] = calendar.split("-").map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

export function TrainingManagementWorkspace({ canManage, today }: { canManage: boolean; today: string }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<Section>("assignments");
  const [preselectedCourseId, setPreselectedCourseId] = useState("");
  const [preselectedAssignmentId, setPreselectedAssignmentId] = useState("");
  const [completionAssignmentId, setCompletionAssignmentId] = useState("");
  const [completionEvidenceFileId, setCompletionEvidenceFileId] = useState("");
  const [assignmentQuery, setAssignmentQuery] = useState("");
  const [assignmentStatus, setAssignmentStatus] = useState("ALL");
  const [completionQuery, setCompletionQuery] = useState("");
  const [completionEvidence, setCompletionEvidence] = useState("ALL");
  const [courseQuery, setCourseQuery] = useState("");
  const [courseStatusFilter, setCourseStatusFilter] = useState("ACTIVE");
  const [courseCategoryFilter, setCourseCategoryFilter] = useState<CourseCategory>("All categories");
  const [draftLessonTitle, setDraftLessonTitle] = useState("");
  const [draftLessonContent, setDraftLessonContent] = useState("");
  const [draftLessons, setDraftLessons] = useState<{ heading: string; content: string }[]>([]);
  const [draftQuestions, setDraftQuestions] = useState<{ prompt: string; choices: string[]; correctIndex: number; explanation: string }[]>([]);
  const [draftQuestionPrompt, setDraftQuestionPrompt] = useState("");
  const [draftQuestionChoices, setDraftQuestionChoices] = useState(["", "", "", ""]);
  const [draftQuestionCorrect, setDraftQuestionCorrect] = useState(0);
  const [draftQuestionExplanation, setDraftQuestionExplanation] = useState("");
  const [draftPassingScore, setDraftPassingScore] = useState(80);
  const [draftCourseId, setDraftCourseId] = useState("");
  const [draftRevision, setDraftRevision] = useState(0);
  const [draftSaving, setDraftSaving] = useState(false);
  const [courseReviews, setCourseReviews] = useState<CourseReview[]>([]);
  const [coursePublications, setCoursePublications] = useState<CoursePublication[]>([]);
  const [reviewReason, setReviewReason] = useState<Record<string, string>>({});
  const [reviewBusyId, setReviewBusyId] = useState("");
  const [inspectedReviewId, setInspectedReviewId] = useState("");
  const [inspectedReviewContent, setInspectedReviewContent] = useState<ReviewContent | null>(null);
  const [previewCourseCode, setPreviewCourseCode] = useState("");
  const [publishedPreviewCourseId, setPublishedPreviewCourseId] = useState("");
  const [publishedPreview, setPublishedPreview] = useState<LearnerCourseContent | null>(null);
  const [publishedPreviewBusy, setPublishedPreviewBusy] = useState(false);
  const [previewAssignmentId, setPreviewAssignmentId] = useState("");

  async function load() {
    const [employeeResponse, courseResponse, assignmentResponse, completionResponse] = await Promise.all([
      fetch("/api/personnel", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/training/courses", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/training/assignments", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/training/completions", { credentials: "same-origin", cache: "no-store" }),
    ]);
    if ((!employeeResponse.ok && employeeResponse.status !== 403) || !courseResponse.ok || !assignmentResponse.ok || !completionResponse.ok) {
      setNotice("Training data could not be refreshed. Reload before making governed changes.");
      return;
    }
    const [employeeBody, courseBody, assignmentBody, completionBody] = await Promise.all([
      employeeResponse.ok ? employeeResponse.json() : { data: [] }, courseResponse.json(), assignmentResponse.json(), completionResponse.json(),
    ]);
    setEmployees(employeeBody.data ?? []);
    setCourses(courseBody.data ?? []);
    setAssignments(assignmentBody.data ?? []);
    setCompletions(completionBody.data ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/personnel", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/training/courses", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/training/assignments", { credentials: "same-origin", cache: "no-store" }),
      fetch("/api/training/completions", { credentials: "same-origin", cache: "no-store" }),
    ]).then(async ([employeeResponse, courseResponse, assignmentResponse, completionResponse]) => {
      if (cancelled) return;
      if ((!employeeResponse.ok && employeeResponse.status !== 403) || !courseResponse.ok || !assignmentResponse.ok || !completionResponse.ok) {
        if (!cancelled) setNotice("Training data could not be refreshed. Reload before making governed changes.");
        return;
      }
      const [employeeBody, courseBody, assignmentBody, completionBody] = await Promise.all([
        employeeResponse.ok ? employeeResponse.json() : { data: [] }, courseResponse.json(), assignmentResponse.json(), completionResponse.json(),
      ]);
      if (!cancelled) {
        setEmployees(employeeBody.data ?? []);
        setCourses(courseBody.data ?? []);
        setAssignments(assignmentBody.data ?? []);
        setCompletions(completionBody.data ?? []);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const courseById = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses]);
  const todayStart = useMemo(() => dateOnlyTime(today) ?? 0, [today]);
  const activeAssignments = assignments.filter((assignment) => assignment.status === "ASSIGNED");
  const activeCourses = courses.filter((course) => course.active);
  const visibleCourses = courses.filter((course) => {
    if (courseCategoryFilter !== "All categories" && courseCategory(course) !== courseCategoryFilter) return false;
    if (courseStatusFilter === "ACTIVE" && !course.active) return false;
    if (courseStatusFilter === "INACTIVE" && course.active) return false;
    return courseQuery.trim().toLowerCase().split(/\s+/).filter(Boolean).every((word) => `${course.code} ${course.title}`.toLowerCase().includes(word));
  });
  const eligibleEmployees = employees.filter((employee) => employee.status === "ACTIVE");
  const completionAssignment = assignments.find((assignment) => assignment.id === completionAssignmentId);
  const completionCourseCode = completionAssignment ? courseById.get(completionAssignment.courseId)?.code : undefined;
  const demoCompletionEvidenceRequired = completionCourseCode === "DEMO-HIPAA" || completionCourseCode === "DEMO-BBP";

  const queryWords = assignmentQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visibleAssignments = assignments.map((assignment) => {
    const dueTime = dateOnlyTime(assignment.dueAt);
    const status = assignment.status === "ASSIGNED" && dueTime !== null && dueTime < todayStart ? "OVERDUE" : assignment.status;
    const employee = employeeById.get(assignment.employeeId);
    const course = courseById.get(assignment.courseId);
    const employeeLabel = employee ? `${employee.employeeNumber} · ${employee.lastName}, ${employee.firstName}` : assignment.employeeId;
    const courseLabel = course ? `${course.code} · ${course.title}` : assignment.courseId;
    return { assignment, status, employeeLabel, courseLabel };
  }).filter(({ status, employeeLabel, courseLabel }) => {
    if (assignmentStatus !== "ALL" && status !== assignmentStatus) return false;
    const searchText = `${employeeLabel} ${courseLabel}`.toLowerCase();
    return queryWords.every((word) => searchText.includes(word));
  });

  const visibleCompletions = completions.filter((completion) => {
    const employee = employeeById.get(completion.employeeId);
    const course = courseById.get(completion.courseId);
    const searchText = `${employee?.employeeNumber ?? ""} ${employee?.firstName ?? ""} ${employee?.lastName ?? ""} ${course?.code ?? ""} ${course?.title ?? ""} ${completion.result ?? ""}`.toLowerCase();
    if (!completionQuery.trim().toLowerCase().split(/\s+/).filter(Boolean).every((word) => searchText.includes(word))) return false;
    if (completionEvidence === "ATTACHED") return Boolean(completion.fileId);
    if (completionEvidence === "MISSING") return !completion.fileId;
    return true;
  });

  function addDraftLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const heading = draftLessonTitle.trim();
    const content = draftLessonContent.trim();
    if (!heading || !content) return;
    setDraftLessons((current) => [...current, { heading, content }]);
    setDraftLessonTitle("");
    setDraftLessonContent("");
  }

  function addDraftQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = draftQuestionPrompt.trim();
    const choices = draftQuestionChoices.map((choice) => choice.trim());
    if (!prompt || choices.some((choice) => !choice) || new Set(choices.map((choice) => choice.toLowerCase())).size !== 4) {
      setNotice("Provide a question and four distinct, nonempty answer choices.");
      return;
    }
    setDraftQuestions((current) => [...current, { prompt, choices, correctIndex: draftQuestionCorrect, explanation: draftQuestionExplanation.trim() }]);
    setDraftQuestionPrompt("");
    setDraftQuestionChoices(["", "", "", ""]);
    setDraftQuestionCorrect(0);
    setDraftQuestionExplanation("");
    setNotice("");
  }

  async function importDraft(file: File | undefined) {
    if (!file) return;
    if (file.size > 250_000) { setNotice("Draft file is too large (250 KB maximum)."); return; }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object") throw new Error("Invalid draft");
      const data = parsed as Record<string, unknown>;
      if (data.format !== "trace-qms-course-draft-v2" || data.status !== "LOCAL_DRAFT_NOT_PUBLISHED") throw new Error("Unsupported draft format");
      if (!Array.isArray(data.lessons) || data.lessons.length > 100) throw new Error("Invalid lesson count");
      const lessons = data.lessons.map((item: unknown) => {
        if (!item || typeof item !== "object") throw new Error("Invalid lesson");
        const lesson = item as Record<string, unknown>;
        if (typeof lesson.heading !== "string" || !lesson.heading.trim() || lesson.heading.length > 160 || typeof lesson.content !== "string" || !lesson.content.trim() || lesson.content.length > 10000) throw new Error("Invalid lesson content");
        return { heading: lesson.heading, content: lesson.content };
      });
      if (!data.assessment || typeof data.assessment !== "object") throw new Error("Missing assessment");
      const assessment = data.assessment as Record<string, unknown>;
      if (!Number.isInteger(assessment.passingScorePercent) || Number(assessment.passingScorePercent) < 1 || Number(assessment.passingScorePercent) > 100 || !Array.isArray(assessment.questions) || assessment.questions.length > 100) throw new Error("Invalid assessment");
      const questions = assessment.questions.map((item: unknown) => {
        if (!item || typeof item !== "object") throw new Error("Invalid question");
        const question = item as Record<string, unknown>;
        if (typeof question.prompt !== "string" || !question.prompt.trim() || question.prompt.length > 500 || !Array.isArray(question.choices) || question.choices.length !== 4 || question.choices.some((choice: unknown) => typeof choice !== "string" || !choice.trim() || choice.length > 300) || new Set(question.choices.map((choice: string) => choice.trim().toLowerCase())).size !== 4 || !Number.isInteger(question.correctIndex) || Number(question.correctIndex) < 0 || Number(question.correctIndex) > 3 || typeof question.explanation !== "string" || question.explanation.length > 1000) throw new Error("Invalid question content");
        return { prompt: question.prompt, choices: question.choices as string[], correctIndex: question.correctIndex as number, explanation: question.explanation };
      });
      setDraftLessons(lessons);
      setDraftQuestions(questions);
      setDraftPassingScore(Number(assessment.passingScorePercent));
      setNotice("Local draft imported. Nothing has been saved or published to Trace QMS.");
    } catch {
      setNotice("Draft import failed. Select a valid Trace QMS v2 JSON draft; existing draft was preserved.");
    }
  }

  async function loadSavedDraft() {
    if (!draftCourseId) return;
    setDraftSaving(true);
    try {
      const response = await fetch("/api/training/course-drafts?courseId=" + encodeURIComponent(draftCourseId), { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) { setNotice(body.error || "Unable to load draft."); return; }
      if (!body.data) { setDraftRevision(0); setDraftLessons([]); setDraftQuestions([]); setDraftPassingScore(80); setNotice("No saved draft. Starting a new draft."); return; }
      const data = body.data.content;
      if (data?.format !== "trace-qms-course-draft-v2" || !Array.isArray(data.lessons) || !Array.isArray(data.assessment?.questions)) { setNotice("Unsupported draft format."); return; }
      setDraftLessons(data.lessons); setDraftQuestions(data.assessment.questions); setDraftPassingScore(data.assessment.passingScorePercent);
      setDraftRevision(body.data.revision); setNotice("Saved draft loaded; not published.");
    } catch { setNotice("Unable to load draft."); } finally { setDraftSaving(false); }
  }

  async function saveCourseDraft() {
    if (!draftCourseId || !Number.isInteger(draftPassingScore) || draftPassingScore < 1 || draftPassingScore > 100) { setNotice("Select a course and passing score from 1 to 100."); return; }
    setDraftSaving(true);
    try {
      const response = await fetch("/api/training/course-drafts", { method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseId: draftCourseId, expectedRevision: draftRevision,
          draft: { format: "trace-qms-course-draft-v2", status: "LOCAL_DRAFT_NOT_PUBLISHED", lessons: draftLessons,
            assessment: { passingScorePercent: draftPassingScore, questions: draftQuestions } } }) });
      const body = await response.json();
      if (!response.ok) { setNotice(body.error || "Unable to save draft."); return; }
      setDraftRevision(body.data.revision); setNotice("Course draft saved to your organization. Not published.");
    } catch { setNotice("Unable to save draft."); } finally { setDraftSaving(false); }
  }

  async function submitCourseReview() {
    if (!draftCourseId || draftRevision < 1) { setNotice("Save or load a course draft before submitting it for review."); return; }
    setDraftSaving(true);
    try {
      const response = await fetch("/api/training/course-reviews", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseId: draftCourseId, expectedRevision: draftRevision }) });
      const body = await response.json();
      setNotice(response.ok ? "Saved revision submitted for review. It is not approved, published, or assignable as course content." : (body.error || "Unable to submit review."));
    } catch { setNotice("Unable to submit course review."); } finally { setDraftSaving(false); }
  }

  async function refreshCourseReviews() {
    if (!canManage) return;
    try {
      const [reviewResponse, publicationResponse] = await Promise.all([
        fetch("/api/training/course-reviews", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/training/course-publications", { credentials: "same-origin", cache: "no-store" }),
      ]);
      if (!reviewResponse.ok || !publicationResponse.ok) { setNotice("Course review queue could not be loaded."); return; }
      const [reviewBody, publicationBody] = await Promise.all([reviewResponse.json(), publicationResponse.json()]);
      setCourseReviews(reviewBody.data ?? []);
      setCoursePublications(publicationBody.data ?? []);
    } catch { setNotice("Course review queue could not be loaded."); }
  }

  async function previewPublishedCourse(course: Course) {
    if (publishedPreviewCourseId === course.id) { setPublishedPreviewCourseId(""); setPublishedPreview(null); return; }
    setPublishedPreview(null);
    setPublishedPreviewCourseId("");
    setPublishedPreviewBusy(true);
    try {
      const response = await fetch("/api/training/published-content?courseId=" + encodeURIComponent(course.id), { credentials: "same-origin", cache: "no-store" });
      const body = await response.json();
      if (!response.ok) { setNotice(body.error || "Published course could not be loaded."); return; }
      setPublishedPreview(body.data as LearnerCourseContent);
      setPublishedPreviewCourseId(course.id);
    } catch { setNotice("Published course could not be loaded."); } finally { setPublishedPreviewBusy(false); }
  }

  async function inspectCourseReview(review: CourseReview) {
    setInspectedReviewId("");
    setInspectedReviewContent(null);
    setReviewBusyId(review.id);
    try {
      const response = await fetch("/api/training/course-reviews?reviewId=" + encodeURIComponent(review.id), { credentials: "same-origin", cache: "no-store" });
      const body = await response.json();
      if (!response.ok) { setNotice(body.error || "Unable to inspect submitted content."); return; }
      const content = body.data?.content as ReviewContent | undefined;
      if (!Array.isArray(content?.lessons) || !Array.isArray(content?.assessment?.questions)) { setNotice("Submitted course content is invalid."); return; }
      setInspectedReviewId(review.id);
      setInspectedReviewContent(content);
      setNotice("Review the complete lesson and assessment content before deciding.");
    } catch { setNotice("Unable to inspect submitted content."); } finally { setReviewBusyId(""); }
  }

  async function decideCourseReview(review: CourseReview, decision: "APPROVE" | "REJECT") {
    if (inspectedReviewId !== review.id || !inspectedReviewContent) { setNotice("Inspect the submitted content before making a decision."); return; }
    const reason = (reviewReason[review.id] ?? "").trim();
    if (decision === "REJECT" && !reason) { setNotice("Enter a reason before rejecting a course."); return; }
    setReviewBusyId(review.id);
    try {
      const response = await fetch("/api/training/course-publications", { method: "POST", headers: { "content-type": "application/json" },
        credentials: "same-origin", body: JSON.stringify({ reviewId: review.id, decision, reason: reason || undefined }) });
      const body = await response.json();
      if (!response.ok) { setNotice(body.error || "Course review decision failed."); return; }
      setNotice(decision === "APPROVE" ? "Course version approved and published. Employee delivery and grading are not enabled yet." : "Course review rejected.");
      setInspectedReviewId(""); setInspectedReviewContent(null);
      await refreshCourseReviews();
    } catch { setNotice("Course review decision failed."); } finally { setReviewBusyId(""); }
  }

  function startAssignment(course: Course) {
    setPreselectedCourseId(course.id);
    setNotice("");
    setSection("assign");
  }

  function startCompletion(assignment: Assignment) {
    setPreselectedAssignmentId(assignment.id);
    setCompletionAssignmentId(assignment.id);
    setCompletionEvidenceFileId("");
    setNotice("");
    setSection("complete");
  }

  async function submit(path: string, payload: unknown, form: HTMLFormElement) {
    setBusy(true); setNotice("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setNotice(body?.error || "Training operation failed.");
        return;
      }
      form.reset();
      setNotice("Training operation recorded with audit evidence.");
      await load();
    } catch {
      setNotice("Unable to reach the training service. Check your connection and retry.");
    } finally {
      setBusy(false);
    }
  }

  async function createCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await submit("/api/training/courses", { code: String(form.get("code")), title: String(form.get("title")), description: String(form.get("description")) || null }, event.currentTarget);
  }

  async function createAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await submit("/api/training/assignments", { employeeId: String(form.get("employeeId")), courseId: String(form.get("courseId")), assignedAt: String(form.get("assignedAt")), dueAt: String(form.get("dueAt")) || null }, event.currentTarget);
  }

  async function lifecycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const action = String(form.get("action"));
    const payload = action === "cancel"
      ? { action, assignmentId: String(form.get("assignmentId")), reason: String(form.get("reason")) }
      : { action, assignmentId: String(form.get("assignmentId")), reason: String(form.get("reason")), assignedAt: String(form.get("assignedAt")), dueAt: String(form.get("dueAt")) || null };
    await submit("/api/training/lifecycle", payload, event.currentTarget);
  }

  async function complete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const fileId = String(form.get("fileId") || "");
    if (demoCompletionEvidenceRequired && !fileId) {
      setNotice("Select an AVAILABLE governed evidence file before recording this demo training completion.");
      return;
    }
    await submit("/api/training/completions", { assignmentId: String(form.get("assignmentId")), completedAt: new Date(String(form.get("completedAt"))).toISOString(), result: String(form.get("result")) || null, fileId: fileId || null }, event.currentTarget);
  }

  const sections = [
    { id: "assignments" as const, label: "Training assignments", description: "Browse active, completed, cancelled, and overdue training." },
    { id: "assign" as const, label: "Assign training", description: "Assign an approved course to an eligible employee." },
    { id: "complete" as const, label: "Record completion", description: "Record completion results and governed supporting evidence." },
    { id: "history" as const, label: "Completion history", description: "Review immutable completion results, timestamps, and evidence." },
    { id: "lifecycle" as const, label: "Lifecycle actions", description: "Cancel or reassign active training with a controlled reason." },
    { id: "courses" as const, label: "Course configuration", description: "Browse courses and start new assignments." },
  ].filter((item) => canManage || item.id === "assignments" || item.id === "history" || item.id === "courses");

  return <section className="workspace-section" aria-labelledby="training-heading">
    <div className="section-heading"><div><p className="eyebrow">Training & competency</p><h2 id="training-heading">Training management</h2><p>Open one governed training function at a time while preserving assignment, completion, and lifecycle history.</p></div></div>
    <nav className="module-subnav" aria-label="Training management sections">{sections.map((item) => <button key={item.id} type="button" className={section === item.id ? "active" : ""} aria-current={section === item.id ? "page" : undefined} onClick={() => { setPreselectedCourseId(""); setPreselectedAssignmentId(""); setSection(item.id); setNotice(""); void load(); }}><strong>{item.label}</strong><span>{item.description}</span></button>)}</nav>
    {notice && <p role="status">{notice}</p>}

    {section === "assignments" && <div className="module-section-stack">
      <div className="section-heading"><div><h3>Training assignments</h3><p>Browse governed training assignments and their current lifecycle state.</p></div></div>
      <div className="admin-form">
        <label>Search assignments<input type="search" value={assignmentQuery} onChange={(event) => setAssignmentQuery(event.target.value)} placeholder="Employee name, number, or course" /></label>
        <label>Assignment status<select value={assignmentStatus} onChange={(event) => setAssignmentStatus(event.target.value)}>
          <option value="ALL">All statuses</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="OVERDUE">Overdue</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select></label>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Course</th><th>Assigned</th><th>Due</th><th>Status</th><th>Lifecycle evidence</th>{canManage && <th>Action</th>}</tr></thead>
          <tbody>{visibleAssignments.map(({ assignment, status, employeeLabel, courseLabel }) => (
            <tr key={assignment.id}>
              <td>{employeeLabel}</td><td>{courseLabel}{["DEMO-HIPAA", "DEMO-BBP"].includes(courseById.get(assignment.courseId)?.code ?? "") && <div className="training-assignment-preview-action"><button type="button" className="training-lesson-button" aria-expanded={previewAssignmentId === assignment.id} onClick={() => setPreviewAssignmentId(previewAssignmentId === assignment.id ? "" : assignment.id)}>{previewAssignmentId === assignment.id ? "Hide lessons" : "Open practice lessons"}</button></div>}</td>
              <td>{formatDateOnly(assignment.assignedAt)}</td><td>{formatDateOnly(assignment.dueAt)}</td>
              <td>{status}</td><td>{assignment.cancelReason ?? "—"}</td>
              {canManage && <td>{assignment.status === "ASSIGNED" && (
                <button type="button" disabled={busy} aria-label={`Record completion for ${courseLabel} assigned to ${employeeLabel}`} onClick={() => startCompletion(assignment)}>Record completion</button>
              )}</td>}
            </tr>
          ))}
          {!visibleAssignments.length && <tr><td colSpan={canManage ? 7 : 6}>
            {assignments.length ? "No training assignments match these filters." : "No training assignments have been recorded."}
          </td></tr>}</tbody>
        </table>
      </div>
      {previewAssignmentId && (() => {
        const assignment = assignments.find((item) => item.id === previewAssignmentId);
        const course = assignment ? courseById.get(assignment.courseId) : undefined;
        const employee = assignment ? employeeById.get(assignment.employeeId) : undefined;
        if (!assignment || !course || !["DEMO-HIPAA", "DEMO-BBP"].includes(course.code)) return null;
        return <div className="module-section-stack">
          <p><strong>Assigned training preview:</strong> {employee ? `${employee.employeeNumber} · ${employee.lastName}, ${employee.firstName}` : assignment.employeeId} · {course.title} · {assignment.status}</p>
          <p>This is a supervisor-accessible demonstration preview, not an authenticated employee learning session. Practice answers are not saved, and completing the quiz does not change the assignment or create a completion record.</p>
          {canManage ? <DemoTrainingLesson key={assignment.id} courseCode={course.code} assignmentId={assignment.id} /> : <DemoTrainingLesson key={assignment.id} courseCode={course.code} />}
        </div>;
      })()}
    </div>}

    {section === "assign" && canManage && <div className="module-section-stack">
      <div className="section-heading"><div><h3>Assign training</h3><p>Assign an active course to an eligible employee with governed dates.</p></div></div>
      {!eligibleEmployees.length && <p>No eligible employees are available. Check Personnel and your access to employee records.</p>}
      <form onSubmit={createAssignment} className="admin-form">
        <label>Employee<select name="employeeId" defaultValue="" required><option value="" disabled>Select employee</option>{eligibleEmployees.map((employee) => (
          <option key={employee.id} value={employee.id}>{employee.employeeNumber} · {employee.lastName}, {employee.firstName}</option>
        ))}</select></label>
        <label>Course<select name="courseId" defaultValue={preselectedCourseId} required><option value="" disabled>Select course</option>{activeCourses.map((course) => (
          <option key={course.id} value={course.id}>{course.code} · {course.title}</option>
        ))}</select></label>
        <label>Assigned date<input name="assignedAt" type="date" defaultValue={today.slice(0, 10)} required /></label>
        <label>Due date<input name="dueAt" type="date" /></label>
        <button type="submit" disabled={busy || !eligibleEmployees.length || !activeCourses.length}>Assign training</button>
      </form>
    </div>}

    {section === "complete" && canManage && <div className="module-section-stack"><div className="section-heading"><div><h3>Record completion</h3><p>Record completion results with governed supporting evidence. Demo HIPAA and Bloodborne Pathogens assignments require an available evidence file. Practice quiz scores do not qualify as official completion evidence.</p></div></div><form onSubmit={complete} className="admin-form"><label>Assignment<select name="assignmentId" value={completionAssignmentId} onChange={(event) => { setCompletionAssignmentId(event.target.value); setNotice(""); }} required><option value="" disabled>Select active assignment</option>{activeAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{employeeById.get(assignment.employeeId)?.employeeNumber ?? assignment.employeeId} · {courseById.get(assignment.courseId)?.code ?? assignment.courseId}</option>)}</select></label><label>Completed at<input name="completedAt" type="datetime-local" defaultValue={localDateTimeInputValue(new Date())} required /></label><label>Result<input name="result" maxLength={500} /></label>{demoCompletionEvidenceRequired && <p role="status"><strong>Evidence required for {completionCourseCode}:</strong> Select an AVAILABLE governed training evidence file before recording this completion. The administrator must independently verify that the evidence supports completion; a practice score alone is insufficient.</p>}<GovernedEvidenceFilePicker domain="training" disabled={busy} onSelectionChange={setCompletionEvidenceFileId} /><button type="submit" disabled={busy || (demoCompletionEvidenceRequired && !completionEvidenceFileId)}>Record completion</button></form></div>}

    {section === "history" && <div className="module-section-stack"><div className="section-heading"><div><h3>Completion history</h3><p>Review immutable training completion results, event timestamps, and governed evidence references.</p></div></div><div className="admin-form"><label>Search completions<input type="search" value={completionQuery} onChange={(event) => setCompletionQuery(event.target.value)} placeholder="Employee, course, or result" /></label><label>Evidence attachment<select value={completionEvidence} onChange={(event) => setCompletionEvidence(event.target.value)}><option value="ALL">All records</option><option value="ATTACHED">With attached evidence</option><option value="MISSING">Without attached evidence</option></select></label></div><p>Attachment status is informational. An attached file does not by itself establish verified competency or approval.</p><div className="table-wrap"><table><thead><tr><th>Employee</th><th>Course</th><th>Completed at</th><th>Result</th><th>Evidence</th></tr></thead><tbody>{visibleCompletions.map((completion) => {
      const employee = employeeById.get(completion.employeeId); const course = courseById.get(completion.courseId);
      return <tr key={completion.id}><td>{employee ? `${employee.employeeNumber} · ${employee.lastName}, ${employee.firstName}` : completion.employeeId}</td><td>{course ? `${course.code} · ${course.title}` : completion.courseId}</td><td>{new Date(completion.completedAt).toLocaleString()}</td><td>{completion.result ?? "—"}</td><td>{completion.fileId ? `${completion.evidenceName ?? "Attached file"} · ${completion.evidenceStatus ?? "Linked"}` : "—"}</td></tr>;
    })}{!visibleCompletions.length && <tr><td colSpan={5}>{completions.length ? "No completion records match the selected filters." : "No training completions have been recorded."}</td></tr>}</tbody></table></div></div>}

    {section === "lifecycle" && canManage && <div className="module-section-stack"><div className="section-heading"><div><h3>Lifecycle actions</h3><p>Cancel or reassign active training without rewriting assignment history.</p></div></div><form onSubmit={lifecycle} className="admin-form"><label>Assignment<select name="assignmentId" defaultValue="" required><option value="" disabled>Select active assignment</option>{activeAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{employeeById.get(assignment.employeeId)?.employeeNumber ?? assignment.employeeId} · {courseById.get(assignment.courseId)?.code ?? assignment.courseId}</option>)}</select></label><label>Action<select name="action" defaultValue="cancel"><option value="cancel">Cancel</option><option value="reassign">Reassign</option></select></label><label>Reason<input name="reason" maxLength={500} required /></label><label>New assigned date<input name="assignedAt" type="date" /></label><label>New due date<input name="dueAt" type="date" /></label><button type="submit" disabled={busy}>Apply lifecycle action</button></form></div>}

    {section === "courses" && <div className="module-section-stack">
      {canManage && <section aria-label="Course review and publication queue">
        <h3>Course review and publication</h3>
        <p>Review saved course submissions before publishing. Submitters cannot decide their own submissions. Publishing does not enable employee quizzes or certificates.</p>
        <button type="button" onClick={() => { void refreshCourseReviews(); }} disabled={!!reviewBusyId}>Refresh review queue</button>
        <p role="status">{courseReviews.filter((review) => review.status === "PENDING").length} pending review(s); {coursePublications.length} published version(s) shown.</p>
        {courseReviews.filter((review) => review.status === "PENDING").map((review) => <div key={review.id}>
          <p><strong>{courses.find((course) => course.id === review.courseId)?.title ?? "Course"}</strong> — draft revision {review.draftRevision}, submitted {new Date(review.submittedAt).toLocaleDateString()}</p>
          <button type="button" disabled={!!reviewBusyId} onClick={() => { void inspectCourseReview(review); }}>Inspect submitted lessons and quiz</button>
          {inspectedReviewId === review.id && inspectedReviewContent && <div aria-label="Submitted course content">
            <h4>Submitted lessons ({inspectedReviewContent.lessons.length})</h4>
            {inspectedReviewContent.lessons.map((lesson, index) => <div key={index}><strong>{index + 1}. {lesson.heading}</strong><p style={{ whiteSpace: "pre-wrap" }}>{lesson.content}</p></div>)}
            <h4>Submitted assessment ({inspectedReviewContent.assessment.questions.length} questions; pass score {inspectedReviewContent.assessment.passingScorePercent}%)</h4>
            {inspectedReviewContent.assessment.questions.map((question, index) => <div key={index}><strong>{index + 1}. {question.prompt}</strong>
              <ol>{question.choices.map((choice, choiceIndex) => <li key={choiceIndex}>{choice}{choiceIndex === question.correctIndex ? " (correct answer)" : ""}</li>)}</ol>
              <p>Explanation: {question.explanation}</p>
            </div>)}
          </div>}
          <label>Decision reason (required for rejection)<input maxLength={1000} value={reviewReason[review.id] ?? ""} onChange={(event) => setReviewReason((current) => ({ ...current, [review.id]: event.target.value }))} /></label>
          <button type="button" disabled={!!reviewBusyId || inspectedReviewId !== review.id} onClick={() => { void decideCourseReview(review, "APPROVE"); }}>Approve and publish</button>
          <button type="button" disabled={!!reviewBusyId || inspectedReviewId !== review.id} onClick={() => { void decideCourseReview(review, "REJECT"); }}>Reject</button>
        </div>)}
        {coursePublications.length > 0 && <p>Latest published versions: {coursePublications.slice(0, 10).map((publication) => `${courses.find((course) => course.id === publication.courseId)?.code ?? "Course"} v${publication.version}`).join(", ")}</p>}
      </section>}
      <div className="section-heading"><div><h3>Training course library</h3><p>Find and assign courses configured for your organization. Demonstration lessons are practice only and do not grant CE credit.</p></div></div>
      <label>Search courses by title or code<input type="search" value={courseQuery} onChange={(event) => setCourseQuery(event.target.value)} placeholder="Search training courses" /></label>
      <label>Course availability<select value={courseStatusFilter} onChange={(event) => setCourseStatusFilter(event.target.value)}><option value="ACTIVE">Active courses</option><option value="ALL">All courses</option><option value="INACTIVE">Inactive courses</option></select></label>
      <label>Course category<select value={courseCategoryFilter} onChange={(event) => setCourseCategoryFilter(event.target.value as CourseCategory)}>{courseCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
      <p role="status">Showing {visibleCourses.length} of {courses.length} configured courses. Categories are currently assigned only to the two demonstration courses; other courses remain Uncategorized until governed category metadata is implemented.</p>
      <div className="table-wrap">
        <table aria-label="Training courses">
          <thead><tr><th>Course code</th><th>Course title</th><th>Category</th><th>Lessons</th><th>Status</th>{canManage && <th>Action</th>}</tr></thead>
          <tbody>
            {visibleCourses.map((course) => <tr key={course.id}>
              <td>{course.code}</td>
              <td>{course.title}</td>
              <td>{courseCategory(course)}</td>
              <td><button type="button" className="training-lesson-button" disabled={publishedPreviewBusy} aria-expanded={publishedPreviewCourseId === course.id} onClick={() => { void previewPublishedCourse(course); }}>{publishedPreviewCourseId === course.id ? "Hide published course" : "View published course"}</button> {["DEMO-HIPAA", "DEMO-BBP"].includes(course.code) && <button type="button" className="training-lesson-button" aria-expanded={previewCourseCode === course.code} onClick={() => setPreviewCourseCode(previewCourseCode === course.code ? "" : course.code)}>{previewCourseCode === course.code ? "Hide lessons" : "View lessons & quiz"}</button>}</td>
              <td>{course.active ? "Active" : "Inactive"}</td>
              {canManage && <td>{course.active && (
                <button type="button" disabled={busy} aria-label={`Assign ${course.title}`} onClick={() => startAssignment(course)}>Assign course</button>
              )}</td>}
            </tr>)}
            {!visibleCourses.length && <tr><td colSpan={canManage ? 6 : 5}>{courses.length ? "No courses match your filters." : "No training courses have been created."}</td></tr>}
          </tbody>
        </table>
      </div>
      {publishedPreviewCourseId && publishedPreview && <section aria-label="Published course preview">
        <h4>Published course version {publishedPreview.version} — read-only preview</h4>
        <p>This is approved content, not an employee assessment or completion record. Answers are not provided.</p>
        {publishedPreview.lessons.map((lesson, index) => <div key={index}><h5>{index + 1}. {lesson.heading}</h5><p style={{ whiteSpace: "pre-wrap" }}>{lesson.content}</p></div>)}
        <h5>Assessment preview — {publishedPreview.assessment.questions.length} questions, passing score {publishedPreview.assessment.passingScorePercent}%</h5>
        {publishedPreview.assessment.questions.map((question, index) => <div key={index}><strong>{index + 1}. {question.prompt}</strong><ol>{question.choices.map((choice, choiceIndex) => <li key={choiceIndex}>{choice}</li>)}</ol></div>)}
      </section>}
      {previewCourseCode && <DemoTrainingLesson key={previewCourseCode} courseCode={previewCourseCode} />}
      {canManage && <div className="approval-box"><h4>Lesson draft composer</h4><p>Create original course lessons and quizzes, save a controlled draft, and submit it for separate review. Local edits remain unsaved until you select Save draft. Only approved published versions are available in the published course preview; this composer does not record employee completion.</p>
        <label>Course for saved draft<select value={draftCourseId} onChange={(event) => { setDraftCourseId(event.target.value); setDraftRevision(0); setDraftLessons([]); setDraftQuestions([]); setDraftPassingScore(80); setNotice("Course changed. Load its saved draft before editing."); }}><option value="">Select a course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.code} — {course.title}</option>)}</select></label>
        <p>Saved revision: {draftRevision || "Not loaded"}. Drafts are not published.</p>
        <button type="button" disabled={!draftCourseId || draftSaving} onClick={() => { void loadSavedDraft(); }}>Load saved draft</button>
        <button type="button" disabled={!draftCourseId || draftSaving} onClick={() => { void saveCourseDraft(); }}>Save draft to Trace QMS</button>
        <button type="button" disabled={!draftCourseId || !draftRevision || draftSaving} onClick={() => { void submitCourseReview(); }}>Submit saved revision for review</button>
        <label>Restore an exported draft (replaces current local draft)<input type="file" accept=".json,application/json" onChange={(event) => { void importDraft(event.target.files?.[0]); event.target.value = ""; }} /></label>
        <form onSubmit={addDraftLesson} className="admin-form">
          <label>Lesson heading<input value={draftLessonTitle} onChange={(event) => setDraftLessonTitle(event.target.value)} maxLength={160} required /></label>
          <label>Lesson content<textarea value={draftLessonContent} onChange={(event) => setDraftLessonContent(event.target.value)} maxLength={10000} required /></label>
          <button type="submit">Add lesson to local draft</button>
        </form>
        <p role="status">{draftLessons.length} draft lesson(s) in this session.</p>
        {draftLessons.map((lesson, index) => <div key={index}><strong>{index + 1}. {lesson.heading}</strong><p>{lesson.content}</p><button type="button" onClick={() => setDraftLessons((current) => current.filter((_, position) => position !== index))}>Remove lesson {index + 1}</button></div>)}
        <h4>Assessment draft</h4><p>Quiz questions and answer keys are local drafts only. They are not secure assessments or employee completion evidence.</p>
        <label>Proposed passing score (%)<input type="number" min={1} max={100} value={draftPassingScore} onChange={(event) => setDraftPassingScore(Number(event.target.value))} /></label>
        <form onSubmit={addDraftQuestion} className="admin-form">
          <label>Question<input value={draftQuestionPrompt} onChange={(event) => setDraftQuestionPrompt(event.target.value)} maxLength={500} required /></label>
          {draftQuestionChoices.map((choice, index) => <label key={index}>Answer choice {index + 1}<input value={choice} onChange={(event) => setDraftQuestionChoices((current) => current.map((item, position) => position === index ? event.target.value : item))} maxLength={300} required /></label>)}
          <label>Correct answer<select value={draftQuestionCorrect} onChange={(event) => setDraftQuestionCorrect(Number(event.target.value))}>{draftQuestionChoices.map((_, index) => <option key={index} value={index}>Choice {index + 1}</option>)}</select></label>
          <label>Answer explanation<textarea value={draftQuestionExplanation} onChange={(event) => setDraftQuestionExplanation(event.target.value)} maxLength={1000} /></label>
          <button type="submit">Add question to local draft</button>
        </form>
        <p role="status">{draftQuestions.length} draft question(s).</p>
        {draftQuestions.map((question, index) => <div key={index}><strong>{index + 1}. {question.prompt}</strong><p>Correct answer: {question.choices[question.correctIndex]}</p><button type="button" onClick={() => setDraftQuestions((current) => current.filter((_, position) => position !== index))}>Remove question {index + 1}</button></div>)}
        {(draftLessons.length > 0 || draftQuestions.length > 0) && <button type="button" onClick={() => { const blob = new Blob([JSON.stringify({ format: "trace-qms-course-draft-v2", status: "LOCAL_DRAFT_NOT_PUBLISHED", lessons: draftLessons, assessment: { passingScorePercent: draftPassingScore, questions: draftQuestions } }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "trace-qms-course-lessons-draft.json"; link.click(); URL.revokeObjectURL(url); }}>Export local lesson draft (JSON)</button>}
      </div>}
      {canManage && <form onSubmit={createCourse} className="admin-form">
        <label>Course code<input name="code" maxLength={80} required /></label>
        <label>Course title<input name="title" maxLength={240} required /></label>
        <label>Description<textarea name="description" maxLength={2000} /></label>
        <button type="submit" disabled={busy}>Create course</button>
      </form>}
    </div>}
  </section>;
}
