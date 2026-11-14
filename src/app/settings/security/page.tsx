"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

export default function MfaEnrollmentPage() {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [provisioningUri, setProvisioningUri] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  async function send(path: string, payload: Record<string, string>) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error ?? "Unable to complete enrollment.");
    return body;
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await send("/api/auth/mfa/enroll/start", { password });
      if (typeof result?.data?.provisioningUri !== "string" ||
          !result.data.provisioningUri.startsWith("otpauth://totp/")) {
        throw new Error("Enrollment is unavailable.");
      }
      setProvisioningUri(result.data.provisioningUri);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Enrollment is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !provisioningUri) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await send("/api/auth/mfa/enroll/confirm", { password, code });
      if (result?.data?.mfaEnabled !== true) throw new Error("Verification failed.");
      setComplete(true);
      setProvisioningUri(null);
      setCode("");
      setPassword("");
      setMessage("Authenticator verification is enabled for your account.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 560, margin: "3rem auto", padding: "1.5rem", fontFamily: "system-ui" }}>
      <Link href="/">Back to workspace</Link>
      <h1>Authenticator security</h1>
      {complete ? (
        <p role="status">{message}</p>
      ) : (
        <>
          <p>Protect your account with a six-digit code from an authenticator app. You will need your password to enroll.</p>
          {!provisioningUri ? (
            <form onSubmit={start}>
              <label htmlFor="mfa-password">Confirm your current password</label>
              <input id="mfa-password" type="password" autoComplete="current-password" value={password}
                onChange={(event) => setPassword(event.target.value)} required maxLength={1024}
                style={{ display: "block", width: "100%", margin: "0.5rem 0 1rem", padding: "0.6rem" }} />
              <button type="submit" disabled={busy}>{busy ? "Preparing…" : "Set up authenticator"}</button>
            </form>
          ) : (
            <>
              <p><strong>Step 1:</strong> Open your authenticator app and add an account using the setup key below. Keep this key private.</p>
              <label htmlFor="mfa-secret">Authenticator setup key</label>
              <input id="mfa-secret" type="text" readOnly
                value={new URL(provisioningUri).searchParams.get("secret") ?? ""}
                style={{ display: "block", width: "100%", margin: "0.5rem 0 1rem", padding: "0.6rem" }} />
              <p><strong>Step 2:</strong> Enter the current six-digit code to finish setup.</p>
              <form onSubmit={confirm}>
                <label htmlFor="mfa-code">Authenticator code</label>
                <input id="mfa-code" type="text" inputMode="numeric" autoComplete="one-time-code"
                  pattern="[0-9]{6}" minLength={6} maxLength={6} value={code}
                  onChange={(event) => setCode(event.target.value)} required
                  style={{ display: "block", width: "100%", margin: "0.5rem 0 1rem", padding: "0.6rem" }} />
                <button type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify and enable"}</button>
              </form>
              <p><small>Do not refresh this page until enrollment is complete. The setup key is shown only during this session.</small></p>
            </>
          )}
          {message && <p role="alert">{message}</p>}
        </>
      )}
    </main>
  );
}
