import { LoginForm } from "./login-form";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const previewLabels = new Map([
  ["demo", "Demo environment"],
  ["development-preview", "Development preview"],
]);

const modules = [
  ["Policy & Documentation", "Controlled documents, review workflows, acknowledgments, controlled copies, folders, and retention."],
  ["Personnel", "Governed employee records, job assignments, credentials, qualifications, and supporting evidence."],
  ["Training & Competency", "Training assignments, completions, competency programs, assessments, and reassessment tracking."],
  ["Quality Events & CAPA", "Event intake, investigation, root cause, corrective and preventive actions, effectiveness, and closure."],
  ["Laboratory Operations", "Equipment oversight, compliance holds, service history, calibration, and maintenance visibility."],
  ["Records Management", "Tenant-scoped governed records with controlled identity and historical state."],
  ["Reporting & Analytics", "Governed reports, approved filters, execution history, saved views, and finalized exports."],
  ["Administration", "Organizations, sites, departments, users, roles, permissions, workflows, notifications, and audit history."],
];

export default function LoginPage() {
  const environmentLabel = previewLabels.get(process.env.DEPLOYMENT_TIER ?? "");

  return <main className={styles.page}>
    <header className={styles.header}>
      <a className={styles.brand} href="#top" aria-label="Trace QMS home">
        <span className={styles.brandMark} aria-hidden="true"><span>T</span><span>Q</span></span>
        <span className={styles.brandText}><strong>TRACE QMS</strong><span>Quality management by Trace Scientific</span></span>
      </a>
      <nav className={styles.actions} aria-label="Public page actions">
        <a className={styles.linkButton} href="#request-demo">Request a Demo</a>
        <a className={styles.primaryButton} href="#login">Log In</a>
      </nav>
    </header>

    <section className={styles.hero} id="top">
      <div>
        <p className={styles.eyebrow}>Quality management for modern laboratories</p>
        <h1>Bring controlled quality workflows into one governed workspace.</h1>
        <p className={styles.lede}>Trace QMS helps laboratory teams manage documents, personnel, training, quality events, equipment, records, and reporting without scattering critical quality work across disconnected systems.</p>
        <div className={styles.heroCtas}>
          <a className={styles.primaryButton} href="#request-demo">Request a Demo</a>
          <a className={styles.linkButton} href="#modules">Explore Modules</a>
        </div>
        <p className={styles.trustLine}>Tenant-scoped workflows · Role-based access · Controlled history · Governed evidence</p>
      </div>

      <LoginForm environmentLabel={environmentLabel} />
    </section>

    <section className={styles.valueBand} aria-label="Trace QMS product benefits">
      <div className={styles.valueInner}>
        <article><strong>One quality workspace</strong><span>Bring controlled documents, people, training, events, equipment, and records together without losing domain-specific governance.</span></article>
        <article><strong>Built around controlled workflows</strong><span>Use focused lifecycle actions, approvals, supporting evidence, and historical records instead of informal shared-file processes.</span></article>
        <article><strong>Designed for laboratory operations</strong><span>Support day-to-day quality work with tenant-scoped access, operational queues, due dates, monitoring, and governed reporting.</span></article>
      </div>
    </section>

    <section className={styles.section} id="modules">
      <div className={styles.sectionHeading}>
        <p className={styles.eyebrow}>Modular platform</p>
        <h2>Quality operations in focused, connected modules.</h2>
        <p>Organizations can use the QMS as a unified platform while teams work inside purpose-built governed workspaces for each quality domain.</p>
      </div>
      <div className={styles.moduleGrid}>{modules.map(([title, description], index) => <article className={styles.moduleCard} key={title}><span className={styles.moduleNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
    </section>

    <section className={styles.section} id="request-demo">
      <div className={styles.demo}>
        <div>
          <p className={styles.eyebrow}>See Trace QMS in action</p>
          <h2>Request a guided product demonstration.</h2>
          <p>Explore the document, personnel, training, quality, laboratory operations, records, and reporting workflows with your organization&apos;s use cases in mind.</p>
          {environmentLabel && <p className={styles.demoNote}>This demo uses synthetic data only.</p>}
        </div>
        <a className={styles.primaryButton} href="mailto:info@tracescientific.com?subject=Trace%20QMS%20demo%20request">Email Trace Scientific</a>
      </div>
    </section>

    <footer className={styles.footer}><strong>Trace QMS</strong><span>Quality management software by Trace Scientific</span>{environmentLabel && <span>{environmentLabel}</span>}</footer>
  </main>;
}
