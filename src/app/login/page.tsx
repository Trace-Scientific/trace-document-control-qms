"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationCode: form.get("organizationCode"), email: form.get("email"), password: form.get("password") }),
    });
    const body = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) return setError(body?.error ?? "Sign-in failed.");
    router.replace("/");
    router.refresh();
  }
  return <main className="login-shell">
    <form className="login-card" onSubmit={submit}>
      <p className="eyebrow">Trace Scientific</p>
      <h1>Quality Management System</h1>
      <p>Sign in with your assigned laboratory account.</p>
      <label>Organization code<input name="organizationCode" defaultValue="orange-county-labs" autoComplete="organization" required /></label>
      <label>Email address<input name="email" type="email" autoComplete="username" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p className="login-error" role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
      <small>Development preview — synthetic data only.</small>
    </form>
  </main>;
}

