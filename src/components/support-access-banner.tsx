"use client";

import { useEffect, useState } from "react";

interface ActiveSupportSession {
  supportSessionId: string;
  supportCaseId: string;
  targetOrganizationId: string;
  targetOrganizationName: string;
  expiresAt: string;
  capabilities: string[];
}

export function SupportAccessBanner() {
  const [session, setSession] = useState<ActiveSupportSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetch("/api/platform/support/sessions", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload = (await response.json()) as { data?: ActiveSupportSession };
        return payload.data ?? null;
      })
      .then((data) => {
        if (mounted) setSession(data);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <div role="status" aria-live="polite">Checking controlled support access…</div>;
  }
  if (!session) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        padding: "12px 16px",
        border: "2px solid currentColor",
        background: "#fff4ce",
        color: "#332600",
      }}
    >
      <strong>CONTROLLED SUPPORT ACCESS — {session.targetOrganizationName}</strong>
      <div>
        Case {session.supportCaseId} · Session {session.supportSessionId} · Expires {new Date(session.expiresAt).toLocaleString()}
      </div>
      <div>Permitted capabilities: {session.capabilities.join(", ")}</div>
      <div>Trace support identity remains the recorded actor. Customer-only approvals and signatures are prohibited.</div>
    </aside>
  );
}
