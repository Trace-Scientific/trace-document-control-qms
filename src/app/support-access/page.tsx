import { SupportAccessBanner } from "@/components/support-access-banner";
import { SupportAccessOperations } from "@/components/support-access-operations";

export default function SupportAccessPage() {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <SupportAccessBanner />
      <section style={{ marginTop: 24 }}>
        <h1>Controlled support access</h1>
        <p>
          This surface confirms the active Trace support session and target tenant context. Ordinary tenant QMS routes do not inherit platform authority; only support-aware operations may use the controlled support context.
        </p>
        <p>
          Electronic signatures, tenant approvals, legal-hold release, and tenant security administration remain customer-only actions and are not available through controlled support access.
        </p>
      </section>
      <div style={{ marginTop: 24 }}><SupportAccessOperations /></div>
    </main>
  );
}
