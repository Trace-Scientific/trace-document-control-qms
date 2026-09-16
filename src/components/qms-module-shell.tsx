"use client";

import { useMemo, useState, type ReactNode } from "react";

type ModuleId = "documents" | "reviews" | "administration" | "records" | "personnel" | "training" | "quality" | "laboratory" | "reporting";
type ModuleSection = { id: string; label: string; description: string; content: ReactNode };
type ModuleDefinition = { id: ModuleId; label: string; description: string; content?: ReactNode; sections?: ModuleSection[] };

function FocusedModuleContent({ module }: { module: ModuleDefinition }) {
  const sections = useMemo(() => (module.sections ?? []).filter((section) => section.content), [module.sections]);
  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id ?? "");
  const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0];
  if (!sections.length) return <div className="qms-module-content">{module.content}</div>;
  return <><nav className="qms-subsection-nav" aria-label={`${module.label} sections`}>{sections.map((section) => <button type="button" key={section.id} className={activeSection?.id === section.id ? "active" : ""} aria-current={activeSection?.id === section.id ? "page" : undefined} onClick={() => setActiveSectionId(section.id)}><strong>{section.label}</strong><span>{section.description}</span></button>)}</nav><div className="qms-module-content" key={activeSection?.id}>{activeSection?.content}</div></>;
}

export function QmsModuleShell({ modules }: { modules: ModuleDefinition[] }) {
  const visibleModules = useMemo(() => modules.filter((module) => module.id !== "reviews" && (module.content || module.sections?.some((section) => section.content))), [modules]);
  const [activeModule, setActiveModule] = useState<ModuleId>(visibleModules[0]?.id ?? "documents");
  const active = visibleModules.find((module) => module.id === activeModule) ?? visibleModules[0];
  if (!active) return null;
  return <section className="qms-module-shell" aria-labelledby="qms-module-shell-heading"><div className="qms-module-shell-header"><div><p className="eyebrow">QMS MODULES</p><h2 id="qms-module-shell-heading">Operational workspaces</h2><p>Open one governed domain at a time instead of rendering every permitted workspace in one continuous page.</p></div><a href="/help" aria-label={`Open Help Center for ${active.label}`}>Help Center</a></div><nav className="qms-module-nav" aria-label="QMS modules">{visibleModules.map((module) => <button type="button" key={module.id} className={active.id === module.id ? "active" : ""} aria-current={active.id === module.id ? "page" : undefined} onClick={() => setActiveModule(module.id)}><strong>{module.label}</strong><span>{module.description}</span></button>)}</nav><FocusedModuleContent key={active.id} module={active} /></section>;
}
