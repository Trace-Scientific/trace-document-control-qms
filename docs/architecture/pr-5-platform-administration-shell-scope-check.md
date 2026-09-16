# PR 5 Scope Check — Platform Administration Shell

Baseline: `main` at `eab38ba07c10b9a35237f55d8f7051c3c72b9a10`
Branch: `codex/platform-administration-shell`

## Included

- Separate `/platform` control-plane route.
- Permission-aware `PlatformAdministrationShell`.
- `/api/platform/me` server-derived platform identity/membership grant endpoint.
- Customer-account read surface using the existing governed customer API.
- Link to the existing controlled support-access surface.
- Navigation for subscriptions/entitlements, audit, security, and approved later platform domains.
- Clear available/foundation/planned state labels.
- Responsive shell styling.
- Regression tests proving tenant QMS shell and tenant authorization remain separate.
- Architecture documentation.

## Explicitly excluded

- Sales/commission business logic.
- Help Center/manual business logic.
- System-health backend.
- Integration framework/provider adapters.
- Billing/accounting/CRM providers.
- Tenant RBAC changes.
- Tenant QMS navigation conversion into a platform shell.
- Cross-tenant regulated-content reporting.
- New database tables or migrations.

## Security check

- Platform navigation comes from independent platform grants.
- Hiding navigation is not relied on for authorization; existing platform APIs/services remain server-authoritative.
- Ordinary tenant authorization has no platform bypass.
- Support access remains case-bound and time-limited; no impersonation shortcut is introduced.
