"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlatformControlledUserManualPanel } from "./platform-controlled-user-manual-panel";
import { PlatformReviewedHelpBaselinePanel } from "./platform-reviewed-help-baseline-panel";
import type { PlatformPermissionKey } from "@/lib/platform/permissions";
import { PlatformNotificationsPanel, PlatformReportingPanel } from "./platform-notifications-reporting-panel";
import { PlatformSystemHealthPanel } from "./platform-system-health-panel";
import { PlatformIntegrationsPanel } from "./platform-integrations-panel";
import { PlatformSupportIntakePanel } from "./platform-support-intake-panel";
import { PlatformSubscriptionsPanel } from "./platform-subscriptions-panel";
import { PlatformSalesPanel } from "./platform-sales-panel";
import { PlatformCommissionsPanel } from "./platform-commissions-panel";
import { PlatformCustomersPanel, type CommercialCustomerAccount } from "./platform-customers-panel";
import { PlatformAuditPanel } from "./platform-audit-panel";
import styles from "./platform-administration-shell.module.css";

type PlatformContextPayload = { platformIdentityId: string; platformMembershipId: string; permissions: PlatformPermissionKey[] };
type CustomerAccount = CommercialCustomerAccount;
type SectionId = "overview" | "customers" | "subscriptions" | "support" | "sales" | "commissions" | "help" | "notifications" | "reporting" | "audit" | "health" | "integrations" | "security";
type SectionDefinition = { id: SectionId; label: string; description: string; anyPermission?: PlatformPermissionKey[]; phase: "available" | "foundation" | "planned" };

const sections: SectionDefinition[] = [
  { id: "overview", label: "Overview", description: "Trace QMS control-plane entry point.", phase: "available" },
  { id: "customers", label: "Customers", description: "Commercial customer accounts and tenant bindings.", anyPermission: ["platform.organization.read", "platform.organization.manage"], phase: "available" },
  { id: "subscriptions", label: "Subscriptions & entitlements", description: "Product plans, subscriptions, and feature access.", anyPermission: ["platform.subscription.read", "platform.subscription.manage", "platform.entitlement.manage"], phase: "foundation" },
  { id: "support", label: "Support access", description: "Case-bound controlled tenant support access.", anyPermission: ["platform.support.request", "platform.support.approve", "platform.support.access"], phase: "available" },
  { id: "sales", label: "Sales", description: "Sales ownership and customer attribution.", anyPermission: ["platform.sales.read", "platform.sales.manage"], phase: "foundation" },
  { id: "commissions", label: "Commissions", description: "Governed commission accruals and payments.", anyPermission: ["platform.commission.read", "platform.commission.manage"], phase: "foundation" },
  { id: "help", label: "Help & User Manual", description: "Help Center and controlled user-manual authoring, readiness, and publishing.", anyPermission: ["platform.help.manage"], phase: "foundation" },
  { id: "notifications", label: "Notifications", description: "Platform-scoped inbox, delivery monitoring, retry, and dead-letter controls.", anyPermission: ["platform.notification.read", "platform.notification.manage"], phase: "foundation" },
  { id: "reporting", label: "Reporting", description: "Commercial and operational control-plane reporting without regulated tenant content.", anyPermission: ["platform.reporting.read"], phase: "foundation" },
  { id: "audit", label: "Platform audit", description: "Trace-side control-plane audit history.", anyPermission: ["platform.audit.read"], phase: "foundation" },
  { id: "health", label: "System health", description: "Sanitized application, database, worker, scheduler, and integration health.", anyPermission: ["platform.health.read"], phase: "available" },
  { id: "integrations", label: "Integrations", description: "Vendor-neutral adapter, delivery, webhook, and replay controls.", anyPermission: ["platform.integration.manage"], phase: "foundation" },
  { id: "security", label: "Platform security", description: "Platform roles, permissions, and memberships.", anyPermission: ["platform.security.manage"], phase: "foundation" },
];

function canSee(section: SectionDefinition, permissions: readonly PlatformPermissionKey[]) { return !section.anyPermission || section.anyPermission.some((permission) => permissions.includes(permission)); }
function PhaseBadge({ phase }: { phase: SectionDefinition["phase"] }) { return <span className={styles.badge}>{phase === "available" ? "Available" : phase === "foundation" ? "Foundation" : "Planned"}</span>; }

export function PlatformAdministrationShell() {
  const [context, setContext] = useState<PlatformContextPayload | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [customers, setCustomers] = useState<CustomerAccount[] | null>(null);
  const [customerError, setCustomerError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/platform/me", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error(response.status === 401 ? "Platform access is not enabled for this account." : "Platform context could not be loaded.");
      return response.json() as Promise<PlatformContextPayload>;
    }).then((payload) => { if (!cancelled) setContext(payload); }).catch((error: unknown) => { if (!cancelled) setContextError(error instanceof Error ? error.message : "Platform context could not be loaded."); });
    return () => { cancelled = true; };
  }, []);

  const visibleSections = useMemo(() => (context ? sections.filter((section) => canSee(section, context.permissions)) : []), [context]);

  const reloadCustomers = useCallback(async () => {
    if (!context) return;
    setCustomerError(null);
    const response = await fetch("/api/platform/customers", { cache: "no-store" });
    if (!response.ok) throw new Error("Customer accounts could not be loaded.");
    const payload = await response.json() as { data: CustomerAccount[] };
    setCustomers(payload.data);
  }, [context]);

  useEffect(() => {
    if (!context || !["customers", "subscriptions", "sales"].includes(activeSection) || customers !== null || customerError) return;
    let cancelled = false;
    void reloadCustomers().catch((error: unknown) => {
      if (!cancelled) setCustomerError(error instanceof Error ? error.message : "Customer accounts could not be loaded.");
    });
    return () => { cancelled = true; };
  }, [activeSection, context, customerError, customers, reloadCustomers]);

  if (contextError) return <main className={styles.main}><div className={styles.error} role="alert"><strong>Platform Administration unavailable.</strong><p>{contextError}</p><a className={styles.cardLink} href="/">Return to tenant QMS</a></div></main>;
  if (!context) return <main className={styles.main}><div className={styles.notice}>Loading platform authorization…</div></main>;
  const active = visibleSections.find((section) => section.id === activeSection) ?? visibleSections[0];

  return <div className={styles.shell}>
    <header className={styles.header}><div className={styles.brandBlock}><p className={styles.eyebrow}>TRACE SCIENTIFIC CONTROL PLANE</p><h1>Platform Administration</h1><p className={styles.contextNote}>Platform authority is separate from tenant QMS roles and permissions.</p></div><a className={styles.returnLink} href="/">Open tenant QMS</a></header>
    <div className={styles.body}><nav className={styles.nav} aria-label="Platform Administration"><ul className={styles.navList}>{visibleSections.map((section) => <li key={section.id}><button type="button" className={`${styles.navButton} ${active?.id === section.id ? styles.navButtonActive : ""}`} onClick={() => setActiveSection(section.id)}>{section.label}</button></li>)}</ul></nav>
      <main className={styles.main}>{active ? <><div className={styles.sectionHeader}><div><p className={styles.eyebrow}>PLATFORM WORKSPACE</p><h2>{active.label}</h2><p className={styles.contextNote}>{active.description}</p></div><PhaseBadge phase={active.phase} /></div><SectionContent section={active} permissions={context.permissions} customers={customers} customerError={customerError} reloadCustomers={reloadCustomers} /></> : null}</main>
    </div>
  </div>;
}

function SectionContent({ section, permissions, customers, customerError, reloadCustomers }: { section: SectionDefinition; permissions: PlatformPermissionKey[]; customers: CustomerAccount[] | null; customerError: string | null; reloadCustomers: () => Promise<void> }) {
  if (section.id === "overview") { const enabled = sections.filter((item) => canSee(item, permissions) && item.id !== "overview"); return <div className={styles.grid}>{enabled.map((item) => <article className={styles.card} key={item.id}><h3>{item.label}</h3><p>{item.description}</p><PhaseBadge phase={item.phase} /></article>)}</div>; }
  if (section.id === "customers") { if (customerError) return <div className={styles.error}>{customerError}</div>; if (!customers) return <div className={styles.notice}>Loading customer accounts…</div>; return <PlatformCustomersPanel customers={customers} canManage={permissions.includes("platform.organization.manage")} onReload={reloadCustomers} />; }
  if (section.id === "support") return <PlatformSupportIntakePanel />;
  if (section.id === "subscriptions") return <PlatformSubscriptionsPanel customers={customers ?? []} canManage={permissions.includes("platform.subscription.manage")} canManageEntitlements={permissions.includes("platform.entitlement.manage")} />;
  if (section.id === "sales") return <PlatformSalesPanel customers={customers ?? []} canManage={permissions.includes("platform.sales.manage")} />;
  if (section.id === "commissions") return <PlatformCommissionsPanel canManage={permissions.includes("platform.commission.manage")} />;
  if (section.id === "help") return <><div className={styles.grid}><article className={styles.card}><h3>Help Center</h3><p>Published operational articles are searchable by authenticated QMS users. Draft and archived content remain unavailable from the user-facing read API.</p><a className={styles.cardLink} href="/help">Open Help Center</a></article><PlatformReviewedHelpBaselinePanel /></div><PlatformControlledUserManualPanel /></>;
  if (section.id === "notifications") return <PlatformNotificationsPanel canRead={permissions.includes("platform.notification.read")} canManage={permissions.includes("platform.notification.manage")} />;
  if (section.id === "reporting") return <PlatformReportingPanel />;
  if (section.id === "health") return <PlatformSystemHealthPanel />;
  if (section.id === "integrations") return <PlatformIntegrationsPanel />;
  if (section.id === "audit") return <PlatformAuditPanel />;
  if (section.id === "security") return <article className={styles.card}><h3>Platform security foundation</h3><p>Platform identities, memberships, roles, permissions, and deny-by-default authorization are active and remain independent from tenant security administration.</p></article>;
  return null;
}
