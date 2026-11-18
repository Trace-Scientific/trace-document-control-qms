"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

export function LoginForm({ environmentLabel }: { environmentLabel?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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

  return challengeToken ? (
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
        <label><span>Password</span><span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required style={{ flex: 1, minWidth: 0 }} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((current) => !current)} style={{ width: "auto", flexShrink: 0 }}>{showPassword ? "Hide" : "Show"}</button></span></label>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Log in securely"}</button>
      {environmentLabel && <small className={styles.previewNote}>{environmentLabel} · Synthetic data only</small>}
    </form>
  );
}
