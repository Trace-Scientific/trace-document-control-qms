"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

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
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [challengeExpiresAt, setChallengeExpiresAt] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ organizationCode: form.get("organizationCode"), email: form.get("email"), password: form.get("password") }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) return setError(body?.error ?? "Sign-in failed.");
      if (body?.data?.mfaRequired === true) {
        if (typeof body.data.challengeToken !== "string" || typeof body.data.expiresAt !== "string") {
          return setError("Verification is unavailable. Please sign in again.");
        }
        setChallengeToken(body.data.challengeToken);
        setChallengeExpiresAt(body.data.expiresAt);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !challengeToken) return;
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ challengeToken, code: form.get("code") }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) return setError(body?.error ?? "Verification failed.");
      router.replace("/");
      router.refresh();
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function restartLogin() {
    setChallengeToken(null);
    setChallengeExpiresAt(null);
    setError("");
  }

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

      {challengeToken ? (
        <form className={styles.loginCard} id="login" onSubmit={verifyMfa}>
          <div className={styles.loginHeading}>
            <p className={styles.eyebrow}>Secure workspace access</p>
            <h2>Verify your identity</h2>
            <p>Enter the six-digit code from your authenticator app.</p>
          </div>
          <div className={styles.loginFields}>
            <label><span>Authenticator code</span><input name="code" type="text" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="one-time-code" autoFocus required /></label>
          </div>
          {challengeExpiresAt && <p className={styles.previewNote}>This verification request expires in five minutes. If it expires, start again.</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button type="submit" disabled={submitting}>{submitting ? "Verifying…" : "Verify and sign in"}</button>
          <button type="button" onClick={restartLogin} disabled={submitting}>Start over</button>
          <small className={styles.previewNote}>Never share your authenticator code with anyone.</small>
        </form>
      ) : (
        <form className={styles.loginCard} id="login" onSubmit={submit}>
          <div className={styles.loginHeading}>
            <p className={styles.eyebrow}>Secure workspace access</p>
            <h2>Log in to Trace QMS</h2>
            <p>Use your assigned organization and account credentials.</p>
          </div>
          <div className={styles.loginFields}>
            <label><span>Organization code</span><input name="organizationCode" placeholder="Enter your organization code" autoComplete="organization" required /></label>
            <label><span>Email address</span><input name="email" type="email" autoComplete="username" required /></label>
            <label><span>Password</span><input name="password" type="password" autoComplete="current-password" required /></label>
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Log in securely"}</button>
          <small className={styles.previewNote}>Development preview · Synthetic data only</small>
        </form>
      )}
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
          <p className={styles.demoNote}>Demo-request intake will be connected as a separate commercial workflow before launch. No regulated tenant data is collected through this public preview.</p>
        </div>
        <a className={styles.primaryButton} href="#login">Existing customer? Log In</a>
      </div>
    </section>

    <footer className={styles.footer}><strong>Trace QMS</strong><span>Quality management software by Trace Scientific</span><span>Development preview</span></footer>
  </main>;
}
