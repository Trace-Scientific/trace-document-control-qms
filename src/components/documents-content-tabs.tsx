"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Section = "library" | "files";

function classify(panel: HTMLElement) {
  const heading = panel.querySelector("h2")?.textContent?.trim();
  if (heading === "Controlled documents") return "library";
  if (heading === "Private controlled files") return "files";
  return null;
}

export function DocumentsContentTabs({ active }: { active: boolean }) {
  const [section, setSection] = useState<Section>("library");
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => {
      const workspace = document.querySelector<HTMLElement>(".workspace-main");
      const firstPanel = Array.from(document.querySelectorAll<HTMLElement>(".workspace-main > section.panel.documents-panel"))
        .find((panel) => classify(panel));
      if (!workspace || !firstPanel) return;
      let nextHost = workspace.querySelector<HTMLElement>("[data-documents-content-tabs]");
      if (!nextHost) {
        nextHost = document.createElement("div");
        nextHost.dataset.documentsContentTabs = "true";
        firstPanel.before(nextHost);
      }
      setHost(nextHost);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const apply = () => {
      document.querySelectorAll<HTMLElement>(".workspace-main > section.panel.documents-panel").forEach((panel) => {
        const panelSection = classify(panel);
        if (panelSection) panel.hidden = panelSection !== section;
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.querySelectorAll<HTMLElement>(".workspace-main > section.panel.documents-panel").forEach((panel) => {
        if (classify(panel)) panel.hidden = false;
      });
    };
  }, [active, section]);

  if (!active || !host) return null;
  return createPortal(
    <section className="document-content-navigation" aria-labelledby="document-content-navigation-heading">
      <div className="section-heading">
        <div>
          <h2 id="document-content-navigation-heading">Library &amp; files</h2>
        </div>
      </div>
      <nav className="qms-subsection-nav" aria-label="Document content sections">
        <button type="button" className={section === "library" ? "active" : ""} aria-current={section === "library" ? "page" : undefined} onClick={() => setSection("library")}>
          <strong>Library</strong><span>Controlled documents, status filters, and current versions.</span>
        </button>
        <button type="button" className={section === "files" ? "active" : ""} aria-current={section === "files" ? "page" : undefined} onClick={() => setSection("files")}>
          <strong>Files</strong><span>Private uploads, integrity, quarantine state, and draft binding.</span>
        </button>
      </nav>
    </section>,
    host,
  );
}
