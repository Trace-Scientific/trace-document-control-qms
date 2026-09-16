"use client";

import { useEffect, useMemo, useState } from "react";
import type { PlatformPermissionKey } from "@/lib/platform/permissions";
import styles from "./platform-administration-shell.module.css";

type PlatformContextPayload = {
  platformIdentityId: string;
  platformMembershipId: string;
  permissions: PlatformPermissionKey[];
};

type CustomerAccount = {
  id: string;
  accountCode: string;
  displayName: string;
  legalName: string;
  status: string;
  organizationId: string | null;
};

type SectionId =
  | "overview"
  | "customers"
  | "subscriptions"
  | "support"
  | "sales"
  | "commissions"
  | "help"
  | "audit"
  | "health"
  | "integrations"
  | "security";

type SectionDefinition = {
  id: SectionId;
  label: string;
  description: string;
  anyPermission?: PlatformPermissionKey[];
  phase: "available" | "foundation" | "planned";
};

const sections: SectionDefinition[] = [
  { id: "overview", label: "Overview", description: "Trace QMS control-plane entry point.", phase: "available" },
  { id: "customers", label: "Customers", description: "Commercial customer accounts and tenant bindings.", anyPermission: ["platform.organization.read", "platform.organization.manage"], phase: "available" },
  { id: "subscriptions", label: "Subscriptions & entitlements", description: "Product plans, subscriptions, and feature access.", anyPermission: ["platform.subscription.read", "platform.subscription.manage", "platform.entitlement.manage"], phase: "foundation" },
  { id: "support", label: "Support access", description: "Case-bound controlled tenant support access.", anyPermission: ["platform.support.request", "platform.support.approve", "platform.support.access"], phase: "available" },
  { id: "sales", label: "Sales", description: "Sales ownership and customer attribution.", anyPermission: ["platform.sales.read", "platform.sales.manage"], phase: "foundation" },
  { id: "commissions", label: "Commissions", description: "Governed commission accruals and payments.", anyPermission: ["platform.commission.read", "platform.commission.manage"], phase: "foundation" },
  { id: "help", label: "Help content", description: "Help Center and controlled user-manual publishing.", anyPermission: ["platform.help.manage"], phase: "planned" },
  { id: "audit", label: "Platform audit", description: "Trace-side control-plane audit history.", anyPermission: ["platform.audit.read"], phase: "foundation" },
  { id: "health", label: "System health", description: "Sanitized application and service health.", anyPermission: ["platform.health.read"], phase: "planned" },
  { id: "integrations", label: "Integrations", description: "Vendor-neutral integration configuration.", anyPermission: ["platform.integration.manage"], phase: "planned" },
  { id: "security", label: "Platform security", description: "Platform roles, permissions, and memberships.", anyPermission: ["platform.security.manage"], phase: "foundation" },
];

function canSee(section: SectionDefinition, permissions: readonly PlatformPermissionKey[]) {
  if (!section.anyPermission) return true;
  return section.anyPermission.some((permission) => permissions.includes(permission));
}

function PhaseBadge({ phase }: { phase: SectionDefinition["phase"] }) {
  const label = phase === "available" ? "Available" : phase === "foundation" ? "Foundation" : "Planned";
  return <span className={styles.badge}>{label}</span>;
}

export function PlatformAdministrationShell() {
  const [context, setContext] = useState<PlatformContextPayload | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [customers, setCustomers] = useState<CustomerAccount[] | null>(null);
  const [customerError, setCustomerError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/platform/me", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 401 ? "Platform access is not enabled for this account." : "Platform context could not be loaded.");
        return response.json() as Promise<PlatformContextPayload>;
      })
      .then((payload) => {
        if (!cancelled) setContext(payload);
      })
      .catch((error: unknown) => {
        if (!cancelled) setContextError(error instanceof Error ? error.message : "Platform context could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleSections = useMemo(
    () => (context ? sections.filter((section) => canSee(section, context.permissions)) : []),
    [context],
  );

  useEffect(() => {
    if (!context || activeSection !== "customers" || customers !== null || customerError) return;
    let cancelled = false;
    void fetch("/api/platform/customers", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Customer accounts could not be loaded.");
        return response.json() as Promise<{ data: CustomerAccount[] }>;
      })
      .then((payload) => {
        if (!cancelled) setCustomers(payload.data);
      })
      .catch((error: unknown) => {
        if (!cancelled) setCustomerError(error instanceof Error ? error.message : "Customer accounts could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [activeSection, context, customerError, customers]);

  if (contextError) {
    return (
      <main className={styles.main}>
        <div className={styles.error} role="alert">
          <strong>Platform Administration unavailable.</strong>
          <p>{contextError}</p>
          <a className={styles.cardLink} href="/">Return to tenant QMS</a>
        </div>
      </main>
    );
  }

  if (!context) {
    return <main className={styles.main}><div className={styles.notice}>Loading platform authorization…</div></main>;
  }

  const active = visibleSections.find((section) => section.id === activeSection) ?? visibleSections[0];

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brandBlock}>
          <p className={styles.eyebrow}>TRACE SCIENTIFIC CONTROL PLANE</p>
          <h1>Platform Administration</h1>
          <p className={styles.contextNote}>Platform authority is separate from tenant QMS roles and permissions.</p>
        </div>
        <a className={styles.returnLink} href="/">Open tenant QMS</a>
      </header>

      <div className={styles.body}>
        <nav className={styles.nav} aria-label="Platform Administration">
          <ul className={styles.navList}>
            {visibleSections.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  className={`${styles.navButton} ${active?.id === section.id ? styles.navButtonActive : ""}`}
                  onClick={() => setActiveSection(section.id)}
                >
                  {section.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className={styles.main}>
          {active ? (
            <>
              <div className={styles.sectionHeader}>
                <div>
                  <p className={styles.eyebrow}>PLATFORM WORKSPACE</p>
                  <h2>{active.label}</h2>
                  <p className={styles.contextNote}>{active.description}</p>
                </div>
                <PhaseBadge phase={active.phase} />
              </div>
              <SectionContent section={active} permissions={context.permissions} customers={customers} customerError={customerError} />
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function SectionContent({
  section,
  permissions,
  customers,
  customerError,
}: {
  section: SectionDefinition;
  permissions: PlatformPermissionKey[];
  customers: CustomerAccount[] | null;
  customerError: string | null;
}) {
  if (section.id === "overview") {
    const enabled = sections.filter((item) => canSee(item, permissions) && item.id !== "overview");
    return (
      <div className={styles.grid}>
        {enabled.map((item) => (
          <article className={styles.card} key={item.id}>
            <h3>{item.label}</h3>
            <p>{item.description}</p>
            <PhaseBadge phase={item.phase} />
          </article>
        ))}
      </div>
    );
  }

  if (section.id === "customers") {
    if (customerError) return <div className={styles.error}>{customerError}</div>;
    if (!customers) return <div className={styles.notice}>Loading customer accounts…</div>;
    if (customers.length === 0) return <div className={styles.notice}>No customer accounts are configured.</div>;
    return (
      <div className={styles.grid}>
        {customers.map((customer) => (
          <article className={styles.card} key={customer.id}>
            <h3>{customer.displayName}</h3>
            <p>{customer.accountCode} · {customer.status}</p>
            <p>{customer.organizationId ? "Tenant organization linked" : "Prospect / no tenant linked"}</p>
          </article>
        ))}
      </div>
    );
  }

  if (section.id === "support") {
    return (
      <article className={styles.card}>
        <h3>Controlled support access</h3>
        <p>Open the case-bound support-access surface. Support sessions remain short-lived, attributable, and separate from tenant RBAC.</p>
        <a className={styles.cardLink} href="/support-access">Open support access</a>
      </article>
    );
  }

  if (section.id === "subscriptions") {
    return (
      <div className={styles.grid}>
        <article className={styles.card}><h3>Catalog foundation</h3><p>Products, features, plans, plan versions, and immutable activated feature matrices are available through the governed platform APIs.</p></article>
        <article className={styles.card}><h3>Subscription foundation</h3><p>Customer subscriptions and effective-dated entitlement overrides are available. Tenant RBAC remains a separate authorization layer.</p></article>
      </div>
    );
  }

  if (section.id === "sales") {
    return (
      <div className={styles.grid}>
        <article className={styles.card}><h3>Sales representatives</h3><p>Trace-side sales representative profiles are linked to active platform identities and governed by separate sales permissions.</p></article>
        <article className={styles.card}><h3>Customer attribution</h3><p>Effective-dated sales assignments preserve which representative owned a customer relationship at the time of a commission event.</p></article>
      </div>
    );
  }

  if (section.id === "commissions") {
    return (
      <div className={styles.grid}>
        <article className={styles.card}><h3>Versioned commission rules</h3><p>Draft plan versions and rules become immutable historical configuration when activated.</p></article>
        <article className={styles.card}><h3>Governed lifecycle</h3><p>Accruals progress PENDING → EARNED → APPROVED → PAID, with separate append-only adjustments, reversals, and payment evidence.</p></article>
      </div>
    );
  }

  if (section.id === "audit") {
    return <article className={styles.card}><h3>Immutable platform audit</h3><p>The append-only platform audit foundation is active. A dedicated audit browser will be added without exposing tenant-regulated content as an unrestricted cross-tenant report.</p></article>;
  }

  if (section.id === "security") {
    return <article className={styles.card}><h3>Platform security foundation</h3><p>Platform identities, memberships, roles, permissions, and deny-by-default authorization are active and remain independent from tenant security administration.</p></article>;
  }

  return <article className={styles.card}><h3>{section.label}</h3><p>This workspace is reserved in the control-plane navigation and will be implemented in its approved focused PR.</p></article>;
}
