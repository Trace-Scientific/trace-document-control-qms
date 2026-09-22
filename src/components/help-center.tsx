"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import styles from "./help-center.module.css";

type ArticleSummary = { slug: string; title: string; summary: string; categoryName: string; revisionNumber: number; publishedAt: string };
type ArticleDetail = ArticleSummary & { body: string; changeSummary: string };
type ManualSummary = { manualCode: string; manualName: string; version: string; effectiveAt: string; releaseNotes: string; publishedAt: string; releaseApplicability: unknown };
type ManualDetail = ManualSummary & { sections: { sectionCode: string; title: string; revisionNumber: number; body: string; changeSummary: string; displayOrder: number }[] };
type SupportHistoryItem = { id: string; subject: string; category: string; priority: string; status: "OPEN" | "ACKNOWLEDGED" | "CLOSED"; submittedAt: string; acknowledgedAt: string | null; closedAt: string | null };
type HelpRecommendation = { key:string; label:string; description:string; query:string; context:string; articleSlug:string };

const contextualSearch: Record<string, { label: string; query: string; articleSlug: string }> = {
  documents: { label: "Documents", query: "controlled document", articleSlug: "controlled-documents" },
  "review-queue": { label: "Review queue", query: "review approval", articleSlug: "review-queue-approvals" },
  administration: { label: "Administration", query: "administration", articleSlug: "tenant-administration" },
  records: { label: "Records", query: "records", articleSlug: "records-management" },
  personnel: { label: "Personnel", query: "personnel", articleSlug: "personnel-credentials-qualifications" },
  training: { label: "Training & competency", query: "training competency", articleSlug: "training-competency" },
  quality: { label: "Quality", query: "quality event CAPA", articleSlug: "quality-events" },
  laboratory: { label: "Laboratory operations", query: "laboratory equipment validation calibration", articleSlug: "equipment-operations" },
  reporting: { label: "Reporting & analytics", query: "reporting export", articleSlug: "governed-reporting" },
};

export function HelpCenter() {
  const [tab, setTab] = useState<"articles" | "manuals" | "support" | "history">("articles");
  const [query, setQuery] = useState("");
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [manuals, setManuals] = useState<ManualSummary[]>([]);
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [manual, setManual] = useState<ManualDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contextLabel, setContextLabel] = useState<string | null>(null);
  const [pageContext, setPageContext] = useState("help");
  const [supportNotice, setSupportNotice] = useState<string | null>(null);
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [supportHistory, setSupportHistory] = useState<SupportHistoryItem[] | null>(null);
  const [recommendations, setRecommendations] = useState<HelpRecommendation[]>([]);

  async function loadArticles(search = "") {
    setError(null);
    const response = await fetch(`/api/help/articles?query=${encodeURIComponent(search)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Help articles could not be loaded.");
    const payload = await response.json() as { data: ArticleSummary[] };
    setArticles(payload.data);
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      const params = new URLSearchParams(window.location.search);
      const rawContext = params.get("context") ?? "help";
      const context = contextualSearch[rawContext];
      setPageContext(context ? rawContext : "help");
      const initialQuery = params.get("query")?.trim() || context?.query || "";
      const directArticle = params.get("article")?.trim() || context?.articleSlug || "";
      if (context) setContextLabel(context.label);
      if (initialQuery) setQuery(initialQuery);
      void loadArticles(initialQuery).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Help articles could not be loaded."));
      if (directArticle) void openArticle(directArticle).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Contextual Help article could not be loaded."));
      void fetch(`/api/help/recommendations?context=${encodeURIComponent(context ? rawContext : "help")}`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Role-aware Help recommendations could not be loaded.");
          return response.json() as Promise<{ data: HelpRecommendation[] }>;
        })
        .then((payload) => setRecommendations(payload.data))
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Role-aware Help recommendations could not be loaded."));
      void fetch("/api/help/manuals", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("User manual releases could not be loaded.");
          return response.json() as Promise<{ data: ManualSummary[] }>;
        })
        .then((payload) => setManuals(payload.data))
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "User manual releases could not be loaded."));
    });
  }, []);

  async function loadSupportHistory() {
    setError(null);
    const response = await fetch("/api/help/support-requests", { cache: "no-store" });
    if (!response.ok) throw new Error("Support request history could not be loaded.");
    const payload = await response.json() as { data: SupportHistoryItem[] };
    setSupportHistory(payload.data);
  }

  async function submitSupportRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSupportSubmitting(true);
    setSupportNotice(null);
    setError(null);
    const form = new FormData(event.currentTarget);
    const userAgent = navigator.userAgent;
    const browserFamily = /Edg\//.test(userAgent) ? "Edge" : /Firefox\//.test(userAgent) ? "Firefox" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : "Other";
    const response = await fetch("/api/help/support-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subject: String(form.get("subject") ?? ""),
        description: String(form.get("description") ?? ""),
        category: String(form.get("category") ?? "GENERAL"),
        priority: String(form.get("priority") ?? "NORMAL"),
        pageContext,
        browserFamily,
      }),
    });
    const body = await response.json().catch(() => null);
    setSupportSubmitting(false);
    if (!response.ok) {
      setError(body?.error || "Support request could not be submitted.");
      return;
    }
    event.currentTarget.reset();
    setSupportNotice(`Support request ${String(body?.data?.id ?? "").slice(0, 8)} submitted successfully.`);
    setSupportHistory(null);
  }

  async function openArticle(slug: string) {
    setError(null);
    const response = await fetch(`/api/help/articles/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Help article could not be loaded.");
    const payload = await response.json() as { data: ArticleDetail };
    setArticle(payload.data);
  }

  async function openManual(item: ManualSummary) {
    setError(null);
    const response = await fetch(`/api/help/manuals/${encodeURIComponent(item.manualCode)}/releases/${encodeURIComponent(item.version)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("User manual release could not be loaded.");
    const payload = await response.json() as { data: ManualDetail };
    setManual(payload.data);
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>TRACE QMS HELP</p>
          <h1>Help Center</h1>
          <p className={styles.muted}>Search published operational guidance or open a controlled user-manual release.</p>
          {contextLabel ? <p className={styles.context}>Showing guidance for: <strong>{contextLabel}</strong></p> : null}
        </div>
        <Link className={styles.back} href="/">Return to QMS</Link>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Help Center content">
        <button className={`${styles.tab} ${tab === "articles" ? styles.active : ""}`} type="button" onClick={() => { setTab("articles"); setManual(null); }}>Help articles</button>
        <button className={`${styles.tab} ${tab === "manuals" ? styles.active : ""}`} type="button" onClick={() => { setTab("manuals"); setArticle(null); }}>Controlled user manual</button>
        <button className={`${styles.tab} ${tab === "support" ? styles.active : ""}`} type="button" onClick={() => { setTab("support"); setArticle(null); setManual(null); }}>Contact support</button>
        <button className={`${styles.tab} ${tab === "history" ? styles.active : ""}`} type="button" onClick={() => { setTab("history"); setArticle(null); setManual(null); if (supportHistory === null) void loadSupportHistory().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Support request history could not be loaded.")); }}>My support requests</button>
      </div>

      {error ? <div className={styles.notice} role="alert">{error}</div> : null}

      {tab === "articles" && !article ? (
        <>
          {recommendations.length ? (
            <section className={styles.recommendations} aria-label="Recommended Help for your access">
              <div>
                <p className={styles.eyebrow}>RECOMMENDED FOR YOUR ACCESS</p>
                <h2>Relevant operating guidance</h2>
                <p className={styles.muted}>Suggestions are based only on the QMS permissions already assigned to your account. Help does not grant additional access.</p>
              </div>
              <div className={styles.recommendationGrid}>
                {recommendations.map((item) => (
                  <button key={item.key} type="button" className={styles.recommendationCard} onClick={() => { setQuery(item.query); void openArticle(item.articleSlug).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Contextual Help article could not be loaded.")); }}>
                    <strong>{item.label}</strong>
                    <span>{item.description}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          <form className={styles.search} onSubmit={(event) => { event.preventDefault(); void loadArticles(query).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Search failed.")); }}>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search published help articles" aria-label="Search help articles" />
            <button type="submit">Search</button>
          </form>
          {articles.length === 0 ? (
            <div className={styles.notice}>
              No published help article matched this context. Clear or broaden the search to see other published guidance.
            </div>
          ) : null}
          <div className={styles.grid}>
            {articles.map((item) => (
              <article className={styles.card} key={item.slug}>
                <button type="button" onClick={() => void openArticle(item.slug).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Article could not be loaded."))}>
                  <p className={styles.eyebrow}>{item.categoryName}</p>
                  <h2>{item.title}</h2>
                  <p>{item.summary}</p>
                  <p className={styles.meta}>Published revision {item.revisionNumber}</p>
                </button>
              </article>
            ))}
          </div>
        </>
      ) : null}

      {tab === "articles" && article ? (
        <article className={styles.detail}>
          <button type="button" className={styles.tab} onClick={() => setArticle(null)}>Back to articles</button>
          <p className={styles.eyebrow}>{article.categoryName}</p>
          <h2>{article.title}</h2>
          <p>{article.summary}</p>
          <p className={styles.meta}>Revision {article.revisionNumber} · {article.changeSummary}</p>
          <div className={styles.body}>{article.body}</div>
        </article>
      ) : null}

      {tab === "manuals" && !manual ? (
        <div className={styles.grid}>
          {manuals.map((item) => (
            <article className={styles.card} key={`${item.manualCode}-${item.version}`}>
              <button type="button" onClick={() => void openManual(item).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Manual could not be loaded."))}>
                <p className={styles.eyebrow}>CONTROLLED USER MANUAL</p>
                <h2>{item.manualName}</h2>
                <p>Version {item.version}</p>
                <p>{item.releaseNotes}</p>
                <p className={styles.meta}>Effective {new Date(item.effectiveAt).toLocaleDateString()}</p>
              </button>
            </article>
          ))}
        </div>
      ) : null}

      {tab === "support" ? (
        <section className={styles.detail}>
          <p className={styles.eyebrow}>SUPPORT REQUEST</p>
          <h2>Contact Trace QMS support</h2>
          <p className={styles.muted}>Describe the problem without including passwords, credentials, patient information, controlled document content, or other regulated record data.</p>
          {supportNotice ? <div className={styles.notice} role="status">{supportNotice}</div> : null}
          <form className={styles.supportForm} onSubmit={submitSupportRequest}>
            <label>Category<select name="category" defaultValue="GENERAL"><option value="GENERAL">General</option><option value="ACCESS">Access</option><option value="DOCUMENTS">Documents</option><option value="TRAINING">Training</option><option value="QUALITY">Quality</option><option value="LABORATORY">Laboratory</option><option value="REPORTING">Reporting</option><option value="TECHNICAL">Technical</option></select></label>
            <label>Priority<select name="priority" defaultValue="NORMAL"><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option></select></label>
            <label>Subject<input name="subject" required minLength={3} maxLength={200} /></label>
            <label>Description<textarea name="description" required minLength={10} maxLength={4000} rows={8} /></label>
            <p className={styles.meta}>Safe diagnostic context included automatically: current QMS workspace and browser family only.</p>
            <button type="submit" disabled={supportSubmitting}>{supportSubmitting ? "Submitting…" : "Submit support request"}</button>
          </form>
        </section>
      ) : null}

      {tab === "history" ? (
        <section className={styles.detail}>
          <p className={styles.eyebrow}>SUPPORT HISTORY</p>
          <h2>My support requests</h2>
          <p className={styles.muted}>Only requests submitted by your account are shown. Internal Trace notes, platform audit details, and controlled support-access information are never displayed here.</p>
          {supportHistory === null ? <div className={styles.notice}>Loading your support requests…</div> : null}
          {supportHistory?.length === 0 ? <div className={styles.notice}>You have not submitted any support requests.</div> : null}
          <div className={styles.historyList}>
            {supportHistory?.map((item) => (
              <article className={styles.historyItem} key={item.id}>
                <div className={styles.historyHeader}><div><p className={styles.eyebrow}>{item.category} · {item.priority}</p><h3>{item.subject}</h3></div><span className={styles.statusBadge}>{item.status === "ACKNOWLEDGED" ? "Acknowledged" : item.status === "CLOSED" ? "Closed" : "Open"}</span></div>
                <p className={styles.meta}>Submitted {new Date(item.submittedAt).toLocaleString()}</p>
                {item.acknowledgedAt ? <p className={styles.meta}>Acknowledged {new Date(item.acknowledgedAt).toLocaleString()}</p> : null}
                {item.closedAt ? <p className={styles.meta}>Closed {new Date(item.closedAt).toLocaleString()}</p> : null}
                <p className={styles.meta}>Request reference: {item.id.slice(0, 8)}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "manuals" && manual ? (
        <article className={styles.detail}>
          <button type="button" className={styles.tab} onClick={() => setManual(null)}>Back to releases</button>
          <p className={styles.eyebrow}>CONTROLLED USER MANUAL</p>
          <h2>{manual.manualName} — Version {manual.version}</h2>
          <p>{manual.releaseNotes}</p>
          <p className={styles.meta}>Effective {new Date(manual.effectiveAt).toLocaleDateString()}</p>
          {manual.sections.map((section) => (
            <section className={styles.section} key={`${section.sectionCode}-${section.revisionNumber}`}>
              <h3>{section.title}</h3>
              <p className={styles.meta}>Section revision {section.revisionNumber} · {section.changeSummary}</p>
              <div className={styles.body}>{section.body}</div>
            </section>
          ))}
        </article>
      ) : null}
    </main>
  );
}
