"use client";

import { useEffect, useState } from "react";
import styles from "./help-center.module.css";

type ArticleSummary = { slug: string; title: string; summary: string; categoryName: string; revisionNumber: number; publishedAt: string };
type ArticleDetail = ArticleSummary & { body: string; changeSummary: string };
type ManualSummary = { manualCode: string; manualName: string; version: string; effectiveAt: string; releaseNotes: string; publishedAt: string; releaseApplicability: unknown };
type ManualDetail = ManualSummary & { sections: { sectionCode: string; title: string; revisionNumber: number; body: string; changeSummary: string; displayOrder: number }[] };

const contextualSearch: Record<string, { label: string; query: string }> = {
  documents: { label: "Documents", query: "controlled document" },
  "review-queue": { label: "Review queue", query: "review approval" },
  administration: { label: "Administration", query: "administration" },
  records: { label: "Records", query: "records" },
  personnel: { label: "Personnel", query: "personnel" },
  training: { label: "Training & competency", query: "training competency" },
  quality: { label: "Quality", query: "quality event CAPA" },
  laboratory: { label: "Laboratory operations", query: "laboratory equipment validation calibration" },
  reporting: { label: "Reporting & analytics", query: "reporting export" },
};

export function HelpCenter() {
  const [tab, setTab] = useState<"articles" | "manuals">("articles");
  const [query, setQuery] = useState("");
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [manuals, setManuals] = useState<ManualSummary[]>([]);
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [manual, setManual] = useState<ManualDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contextLabel, setContextLabel] = useState<string | null>(null);

  async function loadArticles(search = "") {
    setError(null);
    const response = await fetch(`/api/help/articles?query=${encodeURIComponent(search)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Help articles could not be loaded.");
    const payload = await response.json() as { data: ArticleSummary[] };
    setArticles(payload.data);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const context = contextualSearch[params.get("context") ?? ""];
    const initialQuery = params.get("query")?.trim() || context?.query || "";
    if (context) setContextLabel(context.label);
    if (initialQuery) setQuery(initialQuery);
    void loadArticles(initialQuery).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Help articles could not be loaded."));
    void fetch("/api/help/manuals", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("User manual releases could not be loaded.");
        return response.json() as Promise<{ data: ManualSummary[] }>;
      })
      .then((payload) => setManuals(payload.data))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "User manual releases could not be loaded."));
  }, []);

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
        <a className={styles.back} href="/">Return to QMS</a>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Help Center content">
        <button className={`${styles.tab} ${tab === "articles" ? styles.active : ""}`} type="button" onClick={() => { setTab("articles"); setManual(null); }}>Help articles</button>
        <button className={`${styles.tab} ${tab === "manuals" ? styles.active : ""}`} type="button" onClick={() => { setTab("manuals"); setArticle(null); }}>Controlled user manual</button>
      </div>

      {error ? <div className={styles.notice} role="alert">{error}</div> : null}

      {tab === "articles" && !article ? (
        <>
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
